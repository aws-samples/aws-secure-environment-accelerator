import * as cdk from '@aws-cdk/core';
import { CloudAssembly, CloudFormationStackArtifact, Environment, OUTDIR_ENV } from '@aws-cdk/cx-api';
import { ToolkitInfo } from 'aws-cdk';
import { bootstrapEnvironment2 } from 'aws-cdk/lib/api/bootstrap';
import { Configuration } from 'aws-cdk/lib/settings';
import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { PluginHost } from 'aws-cdk/lib/plugin';
import { AssumeProfilePlugin } from '@aws-pbmm/plugin-assume-role/lib/assume-role-plugin';

export interface ToolkitFactoryProps {
  configuration: Configuration;
  sdkProvider: SdkProvider;
}

/**
 * Auxiliary class that wraps around the CdkToolkit class. Use the static method ToolkitFactory.initialize to get an
 * instance of this factory. Then call `createToolkit` to get an instance of the toolkit class for the given app.
 */
export class ToolkitFactory {
  private readonly cloudFormation: CloudFormationDeployments;

  constructor(private props: ToolkitFactoryProps) {
    this.cloudFormation = new CloudFormationDeployments({
      sdkProvider: props.sdkProvider,
    });

    // Register the assume role plugin
    const assumeRolePlugin = new AssumeProfilePlugin();
    assumeRolePlugin.init(PluginHost.instance);
  }

  createToolkit(app: cdk.App) {
    const assembly = app.synth();

    // https://github.com/aws/aws-cdk/blob/master/packages/aws-cdk/lib/cdk-toolkit.ts
    return new ToolkitWrapper({
      cloudFormation: this.cloudFormation,
      configuration: this.props.configuration,
      sdkProvider: this.props.sdkProvider,
      assembly,
    });
  }

  static async initialize() {
    const configuration = new Configuration({
      pathMetadata: false,
      assetMetadata: false,
      versionReporting: false,
    });
    await configuration.load();

    const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults({
      profile: configuration.settings.get(['profile']),
    });
    return new ToolkitFactory({
      configuration,
      sdkProvider,
    });
  }
}

export interface ToolkitWrapperProps {
  cloudFormation: CloudFormationDeployments;
  configuration: Configuration;
  sdkProvider: SdkProvider;
  assembly: CloudAssembly;
}

export type StackOutput = { stack: string; name: string; value: string };
export type StackOutputs = StackOutput[];

export class ToolkitWrapper {
  constructor(private props: ToolkitWrapperProps) {}

  /**
   * Auxiliary method that wraps CdkToolkit.bootstrap.
   */
  async bootstrap() {
    const stacks = this.props.assembly.stacks;
    const promises = stacks.map(async s => this.bootstrapEnvironment(s.environment));
    await Promise.all(promises);
  }

  async bootstrapEnvironment(environment: Environment) {
    // Get defaults from settings
    const settings = this.props.configuration.settings;
    const toolkitStackName: string = ToolkitInfo.determineName(settings.get(['toolkitStackName']));
    const toolkitBucketName: string = settings.get(['toolkitBucket', 'bucketName']);
    const toolkitKmsKey: string = settings.get(['toolkitBucket', 'kmsKeyId']);
    const tags = settings.get(['tags']);

    const trustedAccounts: string[] = [];
    const cloudFormationExecutionPolicies: string[] = [];

    await bootstrapEnvironment2(environment, this.props.sdkProvider, {
      toolkitStackName: toolkitStackName,
      roleArn: undefined,
      force: true,
      parameters: {
        bucketName: toolkitBucketName,
        kmsKeyId: toolkitKmsKey,
        tags,
        execute: true,
        trustedAccounts,
        cloudFormationExecutionPolicies,
      },
    });
  }

  /**
   * Auxiliary method that wraps CdkToolkit.deploy.
   * @return The stack outputs.
   */
  async synth() {
    this.props.assembly.stacks.map(s => console.log(s.assembly.directory, s.templateFile));
    this.props.assembly.stacks.map(s => s.template);
  }

  /**
   * Deploys all stacks of the assembly.
   *
   * @return The stack outputs.
   */
  async deployAllStacks({ parallel }: { parallel: boolean }): Promise<StackOutputs> {
    const stacks = this.props.assembly.stacks;
    if (stacks.length === 0) {
      console.log(`There are no stacks to be deployed`);
      return [];
    }

    let combinedOutputs: StackOutputs;
    if (parallel) {
      // Deploy all stacks in parallel
      const promises = stacks.map(stack => this.deployStack(stack));
      const outputsList = await Promise.all(promises);
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

  async deployStack(stack: CloudFormationStackArtifact): Promise<StackOutputs> {
    const resources = Object.keys(stack.template.Resources || {});
    if (resources.length === 0) {
      if (!(await this.props.cloudFormation.stackExists({ stack }))) {
        console.warn(`${stack.displayName}: stack has no resources, skipping deployment.`);
      } else {
        console.warn(`${stack.displayName}: stack has no resources, deleting existing stack.`);
        await this.props.cloudFormation.deployStack({
          stack,
          deployName: stack.stackName,
          roleArn: undefined,
        });
      }
      return;
    }

    const settings = this.props.configuration.settings;
    const toolkitStackName = ToolkitInfo.determineName(settings.get(['toolkitStackName']));
    const tags = settings.get(['tags']);

    const result = await this.props.cloudFormation.deployStack({
      stack,
      deployName: stack.stackName,
      execute: true,
      force: true,
      notificationArns: undefined,
      reuseAssets: [],
      roleArn: undefined,
      tags: tags,
      toolkitStackName: toolkitStackName,
      usePreviousParameters: false,
    });

    if (result.noOp) {
      console.log(`${stack.displayName}: no changes`);
    } else {
      console.log(`${stack.displayName}: success`);
    }

    return Object.entries(result.outputs).map(([name, value]) => ({
      stack: stack.stackName,
      account: stack.environment.account,
      region: stack.environment.region,
      name,
      value,
    }));
  }
}
