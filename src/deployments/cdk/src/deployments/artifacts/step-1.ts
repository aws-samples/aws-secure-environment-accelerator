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

import * as path from 'path';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { JsonOutputValue } from '../../common/json-output';
import { ArtifactName, CfnArtifactOutput } from './outputs';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { S3CopyFiles } from '@aws-accelerator/custom-resource-s3-copy-files';

export interface ArtifactsStep1Props {
  accountStacks: AccountStacks;
  centralBucket: s3.IBucket;
  config: AcceleratorConfig;
}

export async function step1(props: ArtifactsStep1Props) {
  const { accountStacks, config, centralBucket } = props;

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  // Get the location of the original central bucket
  const centralConfigBucketName = config['global-options']['central-bucket'];
  const centralConfigBucket = s3.Bucket.fromBucketAttributes(masterAccountStack, 'CentralBucket', {
    bucketName: centralConfigBucketName,
  });
  // upload AWS NFW Artifacts
  const nfwUpload = uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'NFW',
    artifactFolderName: 'NFW',
    artifactKeyPrefix: 'nfw',
    centralBucket,
    destinationKeyPrefix: 'nfw',
  });
  // upload SCP Artifacts
  const scpUpload = uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'SCP',
    artifactFolderName: 'SCPs',
    artifactKeyPrefix: 'scp',
    centralBucket,
    destinationKeyPrefix: 'scp',
  });

  // upload IAM-Policies Artifacts
  const iamUpload = uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'IamPolicy',
    artifactFolderName: 'iam-policies',
    artifactKeyPrefix: 'iam-policy',
    centralBucket,
    destinationKeyPrefix: 'iam-policy',
  });

  // upload RDGW Artifacts
  const rdgwUpload = uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'Rdgw',
    artifactFolderName: 'scripts',
    artifactKeyPrefix: 'config/scripts/',
    centralBucket,
    destinationKeyPrefix: 'config/scripts',
  });

  // upload Rsyslog Artifacts
  const rsyslogUpload = uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'Rsyslog',
    artifactFolderName: 'rsyslog',
    artifactKeyPrefix: 'rsyslog',
    centralBucket,
    destinationKeyPrefix: 'rsyslog',
  });

  // upload SSM-Document Artifacts
  const ssmUpload = uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'SsmDocument',
    artifactFolderName: 'ssm-documents',
    artifactKeyPrefix: 'ssm-documents',
    centralBucket,
    destinationKeyPrefix: 'ssm-documents',
    keepExistingFiles: true,
  });

  // upload SSM-Document Artifacts
  const configRulesUpload = uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'ConfigRules',
    artifactFolderName: 'config-rules',
    artifactKeyPrefix: 'config-rules',
    centralBucket,
    destinationKeyPrefix: 'config-rules',
    keepExistingFiles: true,
  });

  // Copy files from source to destination
  const copyFiles = new S3CopyFiles(masterAccountStack, 'CopyFiles', {
    roleName: createRoleName('S3CopyFiles'),
    sourceBucket: centralConfigBucket,
    destinationBucket: centralBucket,
    deleteSourceObjects: false,
    deleteSourceBucket: false,
    forceUpdate: true,
  });
  copyFiles.node.addDependency(ssmUpload);
  copyFiles.node.addDependency(rsyslogUpload);
  copyFiles.node.addDependency(rdgwUpload);
  copyFiles.node.addDependency(iamUpload);
  copyFiles.node.addDependency(scpUpload);
  copyFiles.node.addDependency(configRulesUpload);
  copyFiles.node.addDependency(nfwUpload);
}

function uploadArtifacts(props: {
  accountStack: AccountStack;
  artifactName: ArtifactName;
  artifactFolderName: string;
  artifactKeyPrefix: string;
  centralBucket: s3.IBucket;
  destinationKeyPrefix?: string;
  keepExistingFiles?: boolean;
}): s3deployment.BucketDeployment {
  const {
    accountStack,
    artifactName,
    artifactFolderName,
    artifactKeyPrefix,
    centralBucket,
    destinationKeyPrefix,
    keepExistingFiles,
  } = props;
  const accountKey = accountStack.accountKey;

  const artifactsFolderPath = path.join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    '..',
    '..',
    'reference-artifacts',
    artifactFolderName,
  );

  const s3Deployment = new s3deployment.BucketDeployment(
    accountStack,
    `${artifactName}ArtifactsDeployment${accountKey}`,
    {
      sources: [s3deployment.Source.asset(artifactsFolderPath)],
      destinationBucket: centralBucket,
      destinationKeyPrefix,
      prune: !keepExistingFiles,
    },
  );

  // outputs to store reference artifacts s3 bucket information
  new JsonOutputValue(accountStack, `${artifactName}ArtifactsOutput${accountKey}`, {
    type: `${artifactName}ArtifactsOutput`,
    value: {
      accountKey,
      bucketArn: centralBucket.bucketArn,
      bucketName: centralBucket.bucketName,
      keyPrefix: artifactKeyPrefix,
    },
  });

  new CfnArtifactOutput(accountStack, `${artifactName}ArtifactsOutput${accountKey}S`, {
    accountKey,
    artifactName,
    bucketArn: centralBucket.bucketArn,
    bucketName: centralBucket.bucketName,
    keyPrefix: artifactKeyPrefix,
  });
  return s3Deployment;
}
