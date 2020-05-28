import * as fs from 'fs';
import * as tempy from 'tempy';
import * as cdk from '@aws-cdk/core';
import { CloudAssembly, CloudFormationStackArtifact, EnvironmentUtils } from '@aws-cdk/cx-api';
import { ToolkitInfo } from 'aws-cdk';
import { CdkToolkit } from 'aws-cdk/lib/cdk-toolkit';
import { RequireApproval } from 'aws-cdk/lib/diff';
import { Configuration } from 'aws-cdk/lib/settings';
import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { CloudFormationDeployments } from 'aws-cdk/lib/api/cloudformation-deployments';
import { CloudExecutable } from 'aws-cdk/lib/api/cxapp/cloud-executable';
import { PluginHost } from 'aws-cdk/lib/plugin';
import { AssumeProfilePlugin } from '@aws-pbmm/plugin-assume-role/lib/assume-role-plugin';

export interface ToolkitFactoryProps {
  configuration: Configuration;
  sdkProvider: SdkProvider;
}

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
    const cloudExecutable = new CloudExecutable({
      configuration: this.props.configuration,
      sdkProvider: this.props.sdkProvider,
      synthesizer: async () => assembly,
    });

    // https://github.com/aws/aws-cdk/blob/master/packages/aws-cdk/lib/cdk-toolkit.ts
    const toolkit = new CdkToolkit({
      cloudExecutable,
      cloudFormation: this.cloudFormation,
      configuration: this.props.configuration,
      sdkProvider: this.props.sdkProvider,
    });
    return new ToolkitWrapper({
      configuration: this.props.configuration,
      sdkProvider: this.props.sdkProvider,
      toolkit,
      assembly,
    });
  }

  static async initialize() {
    const configuration = new Configuration({});
    // Disable path and asset metadata and version reporting
    configuration.settings.set(['pathMetadata'], false);
    configuration.settings.set(['assetMetadata'], false);
    configuration.settings.set(['versionReporting'], false);
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
  configuration: Configuration;
  sdkProvider: SdkProvider;
  toolkit: CdkToolkit;
  assembly: CloudAssembly;
}

export type StackOutput = any;
export type StackOutputs = { [stackName: string]: StackOutput };

export class ToolkitWrapper {
  private readonly configuration: Configuration;
  private readonly sdkProvider: SdkProvider;
  private readonly toolkit: CdkToolkit;
  private readonly assembly: CloudAssembly;

  constructor(props: ToolkitWrapperProps) {
    this.configuration = props.configuration;
    this.sdkProvider = props.sdkProvider;
    this.toolkit = props.toolkit;
    this.assembly = props.assembly;
  }

  /**
   * Auxiliary method that wraps CdkToolkit.bootstrap.
   */
  async bootstrap() {
    // Find environments for stacks in the form of
    //   aws://account-id/region
    //   e.g. aws://0123456789/ca-central-1
    const stacks = this.assembly.stacks;
    const environments = await Promise.all(stacks.map(stack => this.sdkProvider.resolveEnvironment(stack.environment)));
    const environmentPaths = environments.map(env => EnvironmentUtils.format(env.account, env.region));

    // Get defaults from settings
    const toolkitStackName: string = ToolkitInfo.determineName(this.configuration.settings.get(['toolkitStackName']));
    const toolkitBucketName: string = this.configuration.settings.get(['toolkitBucket', 'bucketName']);
    const toolkitKmsKey: string = this.configuration.settings.get(['toolkitBucket', 'kmsKeyId']);
    const tags = this.configuration.settings.get(['tags']);

    // And some more defaults
    const roleArn: string | undefined = undefined;
    const useNewBootstrap = false;
    const force = true;
    const trustedAccounts: string[] = [];
    const cloudFormationExecutionPolicies: string[] = [];

    return await this.toolkit.bootstrap(environmentPaths, toolkitStackName, roleArn, useNewBootstrap, force, {
      bucketName: toolkitBucketName,
      kmsKeyId: toolkitKmsKey,
      tags,
      execute: true,
      trustedAccounts,
      cloudFormationExecutionPolicies,
    });
  }

  /**
   * Auxiliary method that wraps CdkToolkit.deploy.
   * @return The stack outputs.
   */
  async synth() {
    const stacks = this.assembly.stacks;
    if (stacks.length === 0) {
      console.log(`There are no stacks to be synthesized`);
      return {};
    }

    await this.toolkit.synth(
      stacks.map(s => s.stackName),
      false,
    );
  }

  /**
   * Auxiliary method that wraps CdkToolkit.deploy.
   * @return The stack outputs.
   */
  async deployAllStacks(): Promise<StackOutputs> {
    const stacks = this.assembly.stacks;
    if (stacks.length === 0) {
      console.log(`There are no stacks to be deployed`);
      return {};
    }

    // Deploy all stacks in parallel
    // const stackDeployPromises = stacks.map(stack => this.deployStack(stack));
    // const stackOutputsList = await Promise.all(stackDeployPromises);
    const stackOutputsList = [];
    for (const stack of stacks) {
      const stackOutputs = await this.deployStack(stack);
      stackOutputsList.push(stackOutputs);
    }

    // Merge all stack outputs
    const stackOutputs = stackOutputsList.reduce((result, output) => ({ ...result, ...output }));
    return stackOutputs;
  }

  async deployStack(stack: CloudFormationStackArtifact): Promise<StackOutputs> {
    const outputsFile = tempy.file({
      extension: 'json',
    });
    await this.toolkit.deploy({
      stackNames: [stack.stackName],
      requireApproval: RequireApproval.Never,
      force: true,
      outputsFile: outputsFile,
    });
    const contents = fs.readFileSync(outputsFile);
    const parsed = JSON.parse(contents.toString());
    return parsed;
  }
}
