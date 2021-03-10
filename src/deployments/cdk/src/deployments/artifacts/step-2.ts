import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { S3CopyFiles } from '@aws-accelerator/custom-resource-s3-copy-files';
import { getStackJsonOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { Account, getAccountId } from '../../utils/accounts';

export interface ArtifactsStep2Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  defaultRegion: string;
  outputs: StackOutput[];
  accounts: Account[];
}

export interface ConfigRuleArtifactsOutput {
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

/**
 *
 * @param props ArtifactsStep2Props
 *
 * Copy required assets to bootstrap regional buckets
 */
export async function step2(props: ArtifactsStep2Props) {
  const { accountStacks, config, defaultRegion, outputs, accounts } = props;
  const configRuleArtifactOutputs: ConfigRuleArtifactsOutput[] = getStackJsonOutput(outputs, {
    accountKey: config.getMandatoryAccountKey('master'),
    outputType: 'ConfigRulesArtifactsOutput',
  });
  if (configRuleArtifactOutputs.length === 0) {
    return;
  }

  const configRuleArtifact = configRuleArtifactOutputs[0];
  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey, defaultRegion);
  const assetsBucket = s3.Bucket.fromBucketName(masterAccountStack, 'AssetsBucket', configRuleArtifact.bucketName);

  // Perform copy seperatly for Master account Default Region

  // const bootstrapBucket = s3.Bucket.fromBucketName(
  //   masterAccountStack,
  //   'MasterBootStrapBucket',
  //   cdk.DefaultStackSynthesizer.DEFAULT_FILE_ASSETS_BUCKET_NAME,
  // );
  //   new S3CopyFiles(masterAccountStack, 'CopyFilesMaster', {
  //     roleName: createRoleName('S3CopyFiles'),
  //     sourceBucket: assetsBucket,
  //     destinationBucket: bootstrapBucket,
  //     deleteSourceObjects: false,
  //     deleteSourceBucket: false,
  //     forceUpdate: true,
  //     prefix: configRuleArtifact.keyPrefix,
  //   });

  const opsAccountKey = config.getMandatoryAccountKey('central-operations');
  const opsAccountId = getAccountId(accounts, opsAccountKey);
  console.log(assetsBucket.bucketName);
  const supportedRegions = config['global-options']['supported-regions'];
  for (const region of supportedRegions) {
    const masterAccountRegionalStack = accountStacks.getOrCreateAccountStack(masterAccountKey, region);
    const bootstrapBucket = s3.Bucket.fromBucketName(
      masterAccountRegionalStack,
      'BootStrapBucket',
      `cdk-pbmmaccel-assets-${opsAccountId}-${region}`,
    );
    // Copy files from source to destination
    new S3CopyFiles(masterAccountRegionalStack, 'CopyFiles', {
      roleName: createRoleName('S3CopyFiles'),
      sourceBucket: assetsBucket,
      destinationBucket: bootstrapBucket,
      deleteSourceObjects: false,
      deleteSourceBucket: false,
      forceUpdate: true,
      prefix: configRuleArtifact.keyPrefix,
    });
  }
}
