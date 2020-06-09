import path from 'path';
import * as cdk from '@aws-cdk/core';
import * as cxschema from '@aws-cdk/cloud-assembly-schema';
import { CloudAssembly, CloudFormationStackArtifact, Environment } from '@aws-cdk/cx-api';
import { ToolkitInfo } from 'aws-cdk';
import { bootstrapEnvironment } from 'aws-cdk/lib/api/bootstrap';
import { Configuration } from 'aws-cdk/lib/settings';
import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { PluginHost } from 'aws-cdk/lib/plugin';
import { AssumeProfilePlugin } from '@aws-pbmm/plugin-assume-role/lib/assume-role-plugin';
import { fulfillAll } from './promise';

// Register the assume role plugin
const assumeRolePlugin = new AssumeProfilePlugin();
assumeRolePlugin.init(PluginHost.instance);

export interface CdkToolkitProps {
  assembly: CloudAssembly;
  configuration: Configuration;
  sdkProvider: SdkProvider;
}

export interface StackOutput {
  stack: string;
  account: string;
  region: string;
  name: string;
  value: string;
}

interface Tag {
  readonly Key: string;
  readonly Value: string;
}

export class CdkToolkit {
  private readonly cloudFormation: CloudFormationDeployments;
  private readonly toolkitStackName: string | undefined;
  private readonly toolkitBucketName: string | undefined;
  private readonly toolkitKmsKey: string | undefined;
  private readonly tags: Tag[] | undefined;

  constructor(private readonly props: CdkToolkitProps) {
    this.cloudFormation = new CloudFormationDeployments({
      sdkProvider: props.sdkProvider,
    });

    // TODO Use the Accelerator prefix
    // TODO Remove configuration dependency
    const settings = this.props.configuration.settings;
    this.toolkitStackName = ToolkitInfo.determineName(settings.get(['toolkitStackName']));
    this.toolkitBucketName = settings.get(['toolkitBucket', 'bucketName']);
    this.toolkitKmsKey = settings.get(['toolkitBucket', 'kmsKeyId']);
    this.tags = settings.get(['tags']);
  }

  static async create(app: cdk.App) {
    const assembly = app.synth();

    const configuration = new Configuration({
      pathMetadata: false,
      assetMetadata: false,
      versionReporting: false,
    });
    await configuration.load();

    const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults({
      profile: configuration.settings.get(['profile']),
    });
    return new CdkToolkit({
      assembly,
      configuration,
      sdkProvider,
    });
  }

  /**
   * Auxiliary method that wraps CdkToolkit.bootstrap.
   */
  async bootstrap() {
    const stacks = this.props.assembly.stacks;
    const promises = stacks.map(s => this.bootstrapEnvironment(s.environment));
    await fulfillAll(promises);
  }

  async bootstrapEnvironment(environment: Environment) {
    console.log(`Bootstrapping environment in account ${environment.account} and region ${environment.region}`);

    const trustedAccounts: string[] = [];
    const cloudFormationExecutionPolicies: string[] = [];

    await bootstrapEnvironment(environment, this.props.sdkProvider, {
      toolkitStackName: this.toolkitStackName,
      roleArn: undefined,
      force: true,
      parameters: {
        bucketName: this.toolkitBucketName,
        cloudFormationExecutionPolicies,
        execute: true,
        kmsKeyId: this.toolkitKmsKey,
        tags: this.tags,
        trustedAccounts,
      },
    });
  }

  /**
   * Auxiliary method that wraps CdkToolkit.deploy.
   * @return The stack outputs.
   */
  async synth() {
    this.props.assembly.stacks.map(s => s.template);
    this.props.assembly.stacks.map(stack => {
      const _ = stack.template; // Force synthesizing the template
      const templatePath = path.join(stack.assembly.directory, stack.templateFile);
      console.warn(`${stack.displayName}: synthesized to ${templatePath}`);
    });
  }

  /**
   * Deploys all stacks of the assembly.
   *
   * @return The stack outputs.
   */
  async deployAllStacks({ parallel }: { parallel: boolean }): Promise<StackOutput[]> {
    const stacks = this.props.assembly.stacks;
    if (stacks.length === 0) {
      console.log(`There are no stacks to be deployed`);
      return [];
    }

    let combinedOutputs: StackOutput[];
    if (parallel) {
      // Deploy all stacks in parallel
      const promises = stacks.map(stack => this.deployStack(stack));
      // Wait for all promises to be fulfilled
      const outputsList = await fulfillAll(promises);
      combinedOutputs = outputsList.reduce((result, output) => [...result, ...output]);
    } else {
      // Deploy all stacks sequentially
      combinedOutputs = [];
      for (const stack of stacks) {
        const output = await this.deployStack(stack);
        combinedOutputs.push(...output);
      }
    }

    // Merge all stack outputs
    return combinedOutputs;
  }

  async deployStack(stack: CloudFormationStackArtifact): Promise<StackOutput[]> {
    const stackExists = await this.cloudFormation.stackExists({ stack });

    const resources = Object.keys(stack.template.Resources || {});
    if (resources.length === 0) {
      if (!stackExists) {
        console.warn(`${stack.displayName}: stack has no resources, skipping deployment`);
        return [];
      }

      console.warn(`${stack.displayName}: stack has no resources, deleting existing stack`);
      this.destroyStack(stack);
      return [];
    }

    try {
      // Add stack tags to the tags list
      const tags = this.tags || [];
      tags.push(...tagsForStack(stack));

      const result = await this.cloudFormation.deployStack({
        stack,
        deployName: stack.stackName,
        execute: true,
        force: true,
        notificationArns: undefined,
        reuseAssets: [],
        roleArn: undefined,
        tags,
        toolkitStackName: this.toolkitStackName,
        usePreviousParameters: false,
      });

      if (result.noOp) {
        console.log(`${stack.displayName}: no changes`);
      } else {
        console.log(`${stack.displayName}: deploy successful`);
      }

      return Object.entries(result.outputs).map(([name, value]) => ({
        stack: stack.stackName,
        account: stack.environment.account,
        region: stack.environment.region,
        name,
        value,
      }));
    } catch (e) {
      console.log(`${stack.displayName}: failed to deploy`);
      if (!stackExists) {
        console.warn(`${stack.displayName}: deleting newly created failed stack`);
        await this.destroyStack(stack);
        console.warn(`${stack.displayName}: deleted newly created failed stack`);
      }
      throw e;
    }
  }

  /**
   * Destroy the given stack. It skips deletion when stack termination is turned on.
   */
  private async destroyStack(stack: CloudFormationStackArtifact): Promise<void> {
    try {
      await this.cloudFormation.destroyStack({
        stack,
        deployName: stack.stackName,
        roleArn: undefined,
        force: true,
      });
    } catch (e) {
      const errorMessage = `${e}`;
      if (errorMessage.includes('cannot be deleted while TerminationProtection is enabled')) {
        console.warn(`${stack.displayName}: cannot delete existing stack with stack termination on`);
        return;
      } else if (errorMessage.includes('it may need to be manually deleted')) {
        console.warn(`${stack.displayName}: ${e}`);
        return;
      }
      throw e;
    }
  }
}

/**
 * See https://github.com/aws/aws-cdk/blob/master/packages/aws-cdk/lib/cdk-toolkit.ts
 *
 * @returns an array with the tags available in the stack metadata.
 */
function tagsForStack(stack: CloudFormationStackArtifact): Tag[] {
  const tagLists = stack.findMetadataByType(cxschema.ArtifactMetadataEntryType.STACK_TAGS).map(
    // the tags in the cloud assembly are stored differently
    // unfortunately.
    x => toCloudFormationTags(x.data as cxschema.Tag[]),
  );
  return Array.prototype.concat([], ...tagLists);
}

/**
 * See https://github.com/aws/aws-cdk/blob/master/packages/aws-cdk/lib/cdk-toolkit.ts
 *
 * Transform tags as they are retrieved from the cloud assembly,
 * to the way that CloudFormation expects them. (Different casing).
 */
function toCloudFormationTags(tags: cxschema.Tag[]): Tag[] {
  return tags.map(t => ({ Key: t.key, Value: t.value }));
}
