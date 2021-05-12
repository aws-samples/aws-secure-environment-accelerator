import path from 'path';
import * as cdk from '@aws-cdk/core';
import * as cxschema from '@aws-cdk/cloud-assembly-schema';
import { CloudAssembly, CloudFormationStackArtifact, Environment } from '@aws-cdk/cx-api';
import { ToolkitInfo, Mode } from 'aws-cdk';
import { setLogLevel } from 'aws-cdk/lib/logging';
import { Bootstrapper } from 'aws-cdk/lib/api/bootstrap';
import { Configuration, Command } from 'aws-cdk/lib/settings';
import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { PluginHost } from 'aws-cdk/lib/plugin';
import { debugModeEnabled } from '@aws-cdk/core/lib/debug';
import { AssumeProfilePlugin } from '@aws-accelerator/cdk-plugin-assume-role/src/assume-role-plugin';
import { fulfillAll } from './promise';

// Set debug logging
setLogLevel(1);

// Register the assume role plugin
const assumeRolePlugin = new AssumeProfilePlugin();
assumeRolePlugin.init(PluginHost.instance);

export interface CdkToolkitProps {
  assemblies: CloudAssembly[];
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
    const env = process.env;
    this.toolkitStackName = env.BOOTSTRAP_STACK_NAME || ToolkitInfo.determineName(settings.get(['toolkitStackName']));
    this.toolkitBucketName = settings.get(['toolkitBucket', 'bucketName']);
    this.toolkitKmsKey = settings.get(['toolkitBucket', 'kmsKeyId']);
    this.tags = settings.get(['tags']);
  }

  static async create(apps: cdk.Stage[]) {
    const assemblies = apps.map(app => app.synth());

    const configuration = new Configuration({
      commandLineArguments: {
        _: [Command.BOOTSTRAP, ...[]],
        pathMetadata: false,
        assetMetadata: false,
        versionReporting: false,
      },
    });
    await configuration.load();

    const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults({
      profile: configuration.settings.get(['profile']),
    });
    return new CdkToolkit({
      assemblies,
      configuration,
      sdkProvider,
    });
  }

  /**
   * Auxiliary method that wraps CdkToolkit.bootstrap.
   */
  async bootstrap() {
    const stacks = this.props.assemblies.flatMap(assembly => assembly.stacks);
    const promises = stacks.map(s => this.bootstrapEnvironment(s.environment));
    await fulfillAll(promises);
  }

  async bootstrapEnvironment(environment: Environment) {
    console.log(`Bootstrapping environment in account ${environment.account} and region ${environment.region}`);

    const trustedAccounts: string[] = [];
    const cloudFormationExecutionPolicies: string[] = [];

    await new Bootstrapper({
      source: 'default',
    }).bootstrapEnvironment(environment, this.props.sdkProvider, {
      toolkitStackName: this.toolkitStackName,
      roleArn: undefined,
      force: true,
      execute: true,
      tags: this.tags,
      parameters: {
        bucketName: this.toolkitBucketName,
        cloudFormationExecutionPolicies,
        kmsKeyId: this.toolkitKmsKey,
        trustedAccounts,
      },
    });
  }

  /**
   * Auxiliary method that wraps CdkToolkit.deploy.
   * @return The stack outputs.
   */
  async synth() {
    const stacks = this.props.assemblies.flatMap(assembly => assembly.stacks);
    stacks.map(s => s.template);
    stacks.map(stack => {
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
    const stacks = this.props.assemblies.flatMap(assembly => assembly.stacks);
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
    console.log(`Deploying stack ${stack.displayName}`);
    if (debugModeEnabled()) {
      console.debug(JSON.stringify(stack.template, null, 2));
    }

    const stackExists = await this.cloudFormation.stackExists({ stack });
    console.log(`Stack ${stack.displayName} exists`, stackExists);

    const resources = Object.keys(stack.template.Resources || {});
    if (resources.length === 0) {
      console.warn(`${stack.displayName}: stack has no resources`);
      if (stackExists) {
        console.warn(`${stack.displayName}: deleting existing stack`);
        this.destroyStack(stack);
      }
      return [];
    } else if (stackExists) {
      const sdk = await this.props.sdkProvider.forEnvironment(stack.environment, Mode.ForWriting);
      const cfn = sdk.cloudFormation();
      if (debugModeEnabled()) {
        cfn.config.logger = console;
      }

      console.log(`Calling describeStacks API for ${stack.displayName} stack`);
      const existingStack = await cfn
        .describeStacks({
          StackName: stack.id,
        })
        .promise();
      console.log(`Finding status of ${stack.displayName} stack`);
      const stackStatus = existingStack.Stacks[0].StackStatus;
      console.log(`${stack.displayName} stack status`, stackStatus);
      try {
        if (stackStatus === 'ROLLBACK_COMPLETE') {
          console.log(`Calling updateTerminationProtection API on ${stack.displayName} stack`);
          await cfn
            .updateTerminationProtection({
              StackName: stack.id,
              EnableTerminationProtection: false,
            })
            .promise();
          console.log(`Successfully disabled termination protection on ${stack.displayName}`);
        }
      } catch (e) {
        console.warn(`Failed to disable termination protection for ${stack.displayName}: ${e}`);
      }
    }

    try {
      // Add stack tags to the tags list
      // const tags = this.tags || [];
      const tags = [...tagsForStack(stack)];

      console.log(`Calling deployStack API on ${stack.displayName} stack`);
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
    console.log(`Destroying stack ${stack.displayName}`);
    try {
      const sdk = await this.props.sdkProvider.forEnvironment(stack.environment, Mode.ForWriting);
      const cfn = sdk.cloudFormation();
      console.log(`Trying to disable termination protection before destroying ${stack.displayName} stack`);
      await cfn
        .updateTerminationProtection({
          StackName: stack.id,
          EnableTerminationProtection: false,
        })
        .promise();
      console.log(`Successfully disabled termination protection on ${stack.displayName} stack`);
    } catch (e) {
      console.warn(`${stack.displayName}: cannot disable stack termination protection`);
    }
    try {
      console.log(`Calling destroyStack API on ${stack.displayName} stack`);
      await this.cloudFormation.destroyStack({
        stack,
        deployName: stack.stackName,
        roleArn: undefined,
        force: true,
      });
      console.log(`Successfully destroyed/deleted the ${stack.displayName} stack`);
    } catch (e) {
      const errorMessage = `${e}`;
      if (errorMessage.includes('it may need to be manually deleted')) {
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
