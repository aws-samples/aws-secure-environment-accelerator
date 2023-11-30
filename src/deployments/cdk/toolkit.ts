/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import path from 'path';
import * as cxschema from '@aws-cdk/cloud-assembly-schema';
import { CloudFormationStackArtifact, Environment } from '@aws-cdk/cx-api';
import { AssetManifest } from 'cdk-assets';
import { ToolkitInfo } from 'aws-cdk/lib/api/toolkit-info';
import { Mode } from 'aws-cdk/lib/api';
import { setLogLevel } from 'aws-cdk/lib/logging';
import { Bootstrapper } from 'aws-cdk/lib/api/bootstrap';
import { Command, Configuration } from 'aws-cdk/lib/settings';
import { SdkProvider } from 'aws-cdk/lib/api/aws-auth';
import { Deployments } from 'aws-cdk/lib/api/deployments';
import { PluginHost } from 'aws-cdk/lib/api/plugin';
import { AssumeProfilePlugin } from '@aws-accelerator/cdk-plugin-assume-role/src/assume-role-plugin';
import { fulfillAll } from './promise';
import { promises as fsp } from 'fs';
import * as cdk from 'aws-cdk-lib';
import * as AWS from 'aws-sdk';

// Set debug logging
setLogLevel(1);

export interface CdkToolkitProps {
  assemblies: cdk.cx_api.CloudAssembly[];
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
  private readonly cloudFormation: Deployments;
  private readonly toolkitStackName: string | undefined;
  private readonly toolkitBucketName: string | undefined;
  private readonly toolkitKmsKey: string | undefined;
  private readonly deploymentPageSize: number;
  private readonly tags: Tag[] | undefined;

  constructor(private readonly props: CdkToolkitProps) {
    this.cloudFormation = new Deployments({
      sdkProvider: props.sdkProvider,
    });

    // TODO Use the Accelerator prefix
    // TODO Remove configuration dependency
    const settings = this.props.configuration.settings;
    const env = process.env;
    // eslint-disable-next-line radix
    this.deploymentPageSize = parseInt(env.DEPLOY_STACK_PAGE_SIZE ?? '') || 850;
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
        pathMetadata: true,
        assetMetadata: true,
        versionReporting: true,
      },
    });
    await configuration.load();

    /*  The code below forces an STS Assume role on itself to address an issue with new CDK Version Upgrade
     */
    const stsClient = new AWS.STS({});
    const getCallerIdentityResponse = await stsClient.getCallerIdentity({}).promise();
    const getCallerIdentityResponseArraySplitBySlash = getCallerIdentityResponse.Arn!.split('/');
    getCallerIdentityResponseArraySplitBySlash.pop();
    const roleName = getCallerIdentityResponseArraySplitBySlash.pop();
    const accountId = getCallerIdentityResponse.Account;
    const roleArn = `arn:aws:iam::${accountId}:role/${roleName}`;

    console.log(`[accelerator] management account roleArn => ${roleArn}`);

    const assumeRoleCredential = await stsClient
      .assumeRole({ RoleArn: roleArn, RoleSessionName: 'acceleratorAssumeRoleSession' })
      .promise();

    process.env.AWS_ACCESS_KEY_ID = assumeRoleCredential.Credentials!.AccessKeyId!;
    process.env.AWS_ACCESS_KEY = assumeRoleCredential.Credentials!.AccessKeyId!;
    process.env.AWS_SECRET_KEY = assumeRoleCredential.Credentials!.SecretAccessKey!;
    process.env.AWS_SECRET_ACCESS_KEY = assumeRoleCredential.Credentials!.SecretAccessKey!;
    process.env.AWS_SESSION_TOKEN = assumeRoleCredential.Credentials!.SessionToken;

    const sdkProvider = await SdkProvider.withAwsCliCompatibleDefaults({
      profile: configuration.settings.get(['profile']),
      ec2creds: true,
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
    console.log('Synthesizing CloudFormation templates');
    const stacks = this.props.assemblies.flatMap(assembly => assembly.stacks);
    stacks.map(s => s.template);
    stacks.map(stack => {
      stack.template; // Force synthesizing the template
      const templatePath = path.join(stack.assembly.directory, stack.templateFile);
      console.warn(
        `${stack.displayName} in account ${stack.environment.account} and region ${stack.environment.region} synthesized to ${templatePath}`,
      );
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
      // @ts-ignore
      const promises = stacks.map(stack => this.deployStack(stack));
      // Wait for all promises to be fulfilled
      const outputsList = await fulfillAll(promises);
      combinedOutputs = outputsList.reduce((result, output) => [...result, ...output]);
    } else {
      // Deploy all stacks sequentially
      combinedOutputs = [];
      for (const stack of stacks) {
        // @ts-ignore
        const output = await this.deployStack(stack);
        combinedOutputs.push(...output);
      }
    }

    // Merge all stack outputs
    return combinedOutputs;
  }
  deploymentLog(stack: CloudFormationStackArtifact, message: string, messageType: string = 'INFO') {
    const stackLoggingInfo = {
      stackName: stack.displayName,
      stackEnvironment: stack.environment,
      assumeRoleArn: stack.assumeRoleArn || 'N/A',
      message,
      messageType,
    };

    console.log(JSON.stringify(stackLoggingInfo));
  }

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async deployStack(stack: CloudFormationStackArtifact, retries: number = 0): Promise<StackOutput[]> {
    // Register the assume role plugin
    const assumeRolePlugin = new AssumeProfilePlugin({ region: stack.environment.region });
    assumeRolePlugin.init(PluginHost.instance);
    this.deploymentLog(stack, 'Deploying Stack');
    let stackExists = false;
    try {
      stackExists = await this.cloudFormation.stackExists({ stack });
    } catch (err) {
      this.deploymentLog(stack, 'FAILED stack exists');
      console.log(err);
    }
    this.deploymentLog(stack, `Stack Exists: ${stackExists}`);

    const resources = Object.keys(stack.template.Resources || {});

    if (resources.length === 0) {
      this.deploymentLog(stack, 'Stack has no resources');
      if (stackExists) {
        this.deploymentLog(stack, 'Deleting existing stack');
        await this.destroyStack(stack);
      }
      return [];
    } else if (stackExists) {
      const sdk = await this.props.sdkProvider.forEnvironment(stack.environment, Mode.ForWriting);
      const cfn = sdk.sdk.cloudFormation();
      console.log('toolkit describe stack');
      this.deploymentLog(stack, 'Describing Stack');
      const existingStack = await cfn
        .describeStacks({
          StackName: stack.stackName,
        })
        .promise();
      const stackStatus = existingStack?.Stacks?.[0]?.StackStatus ?? '';
      this.deploymentLog(stack, `Stack Status: ${stackStatus}`);

      try {
        if (stackStatus === 'ROLLBACK_COMPLETE') {
          this.deploymentLog(stack, 'Disabling termination protection');
          await cfn
            .updateTerminationProtection({
              StackName: stack.stackName,
              EnableTerminationProtection: false,
            })
            .promise();
          this.deploymentLog(stack, 'Disabled termination protection');
        }
      } catch (e) {
        this.deploymentLog(stack, 'Could not disable termination protection');
        console.log(e);
      }
    }

    try {
      // publish assets
      this.deploymentLog(stack, 'Publishing assets');
      const assetManifests = getAssetManifestsForStack(stack);
      for (const assetManifest of assetManifests) {
        for (const entry of assetManifest.entries) {
          await this.cloudFormation.publishSingleAsset(assetManifest, entry, {
            stack,
            roleArn: stack.assumeRoleArn,
            toolkitStackName: this.toolkitStackName,
            stackName: stack.stackName,
          });
        }
      }

      // Add stack tags to the tags list
      // const tags = this.tags || [];
      const tags = [...tagsForStack(stack)];
      this.deploymentLog(stack, 'Calling deployStack API');
      const result = await this.cloudFormation.deployStack({
        stack,
        deployName: stack.stackName,
        force: true,
        notificationArns: undefined,
        reuseAssets: [],
        roleArn: undefined,
        tags,
        toolkitStackName: this.toolkitStackName,
        usePreviousParameters: false,
        quiet: false,
      });

      if (result.noOp) {
        this.deploymentLog(stack, 'No changes to deploy');
      } else {
        this.deploymentLog(stack, 'Deployment Successful');
      }
      this.deploymentLog(stack, 'Deleting assembly directory');
      await this.deleteAssemblyDir(stack.assembly.directory);
      this.deploymentLog(stack, 'Deleted assembly directory');

      return Object.entries(result.outputs).map(([name, value]) => ({
        stack: stack.stackName,
        account: stack.environment.account,
        region: stack.environment.region,
        name,
        value,
      }));
    } catch (e) {
      this.deploymentLog(stack, `Failed to deploy: ${e}`, 'ERROR');
      if (!stackExists) {
        this.deploymentLog(stack, 'Deleting failed stack');
        await this.destroyStack(stack);
        this.deploymentLog(stack, 'Deleted failed stack');
      }
      if (retries < 2) {
        console.log(e);
        this.deploymentLog(stack, `Deployment failed because of error. Retrying deployment ${retries}`);
        await this.sleep(10000);
        return this.deployStack(stack, retries + 1);
      }
      throw e;
    }
  }

  /**
   * Destroy the given stack. It skips deletion when stack termination is turned on.
   */
  private async destroyStack(stack: CloudFormationStackArtifact): Promise<void> {
    this.deploymentLog(stack, 'Destroying stack');
    console.log(
      `Destroying ${stack.displayName} stack in account ${stack.environment.account} in region ${stack.environment.region}`,
    );
    try {
      const sdk = await this.props.sdkProvider.forEnvironment(stack.environment, Mode.ForWriting);
      const cfn = sdk.sdk.cloudFormation();
      this.deploymentLog(stack, 'Disabling termination protection');
      await cfn
        .updateTerminationProtection({
          StackName: stack.stackName,
          EnableTerminationProtection: false,
        })
        .promise();
      this.deploymentLog(stack, 'Disabled termination protection');
    } catch (e) {
      this.deploymentLog(stack, 'Cloud not disable termination protection');
    }
    try {
      this.deploymentLog(stack, 'Destroying stack');
      await this.cloudFormation.destroyStack({
        stack,
        deployName: stack.stackName,
        roleArn: undefined,
        force: true,
      });
      this.deploymentLog(stack, 'Successfully destroyed stack');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      this.deploymentLog(stack, 'Could not destroy stack');
      console.log(e);
      if (e.errorMessage.includes('it may need to be manually deleted')) {
        return;
      }
      throw e;
    }
  }
  private async deleteAssemblyDir(assemblyPath: string) {
    try {
      await fsp.rmdir(assemblyPath, { recursive: true });
    } catch (err) {
      console.warn(err);
      console.log('Could not remove AssemblyDir for succesfully deployed stack', assemblyPath);
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
  // Conditional operator to remove undefined (Will get for Accelerator)
  return Array.prototype.concat([], tagLists.length > 0 ? tagLists[0].filter(t => !!t) : []);
}

/**
 * See https://github.com/aws/aws-cdk/blob/master/packages/aws-cdk/lib/cdk-toolkit.ts
 *
 * Transform tags as they are retrieved from the cloud assembly,
 * to the way that CloudFormation expects them. (Different casing).
 */
function toCloudFormationTags(tags: cxschema.Tag[]): Tag[] {
  return tags.map(t => {
    // Ignoring Accelerator tag in CFN since that is duplicated
    if (t.key !== 'Accelerator') {
      return { Key: t.key, Value: t.value };
    }
  }) as Tag[];
}

function getAssetManifestsForStack(stack: CloudFormationStackArtifact): AssetManifest[] {
  return Object.values(stack.assembly.manifest.artifacts ?? {})
    .filter(
      artifact =>
        artifact.type === cxschema.ArtifactType.ASSET_MANIFEST &&
        (artifact.properties as cxschema.AssetManifestProperties)?.file === `${stack.id}.assets.json`,
    )
    .map(artifact => {
      const fileName = (artifact.properties as cxschema.AssetManifestProperties).file;
      return AssetManifest.fromFile(path.join(stack.assembly.directory, fileName));
    });
}
