import * as path from 'path';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3deployment from '@aws-cdk/aws-s3-deployment';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { JsonOutputValue } from '../../common/json-output';
import { ArtifactName, CfnArtifactOutput } from './outputs';

export interface ArtifactsStep1Props {
  accountStacks: AccountStacks;
  centralBucket: s3.IBucket;
  config: AcceleratorConfig;
}

export async function step1(props: ArtifactsStep1Props) {
  const { accountStacks, config, centralBucket } = props;

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  // upload SCP Artifacts
  uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'SCP',
    artifactFolderName: 'SCPs',
    artifactKeyPrefix: 'scp',
    centralBucket,
    destinationKeyPrefix: 'scp',
  });

  // upload IAM-Policies Artifacts
  uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'IamPolicy',
    artifactFolderName: 'iam-policies',
    artifactKeyPrefix: 'iam-policy',
    centralBucket,
    destinationKeyPrefix: 'iam-policy',
  });

  // upload RDGW Artifacts
  uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'Rdgw',
    artifactFolderName: 'scripts',
    artifactKeyPrefix: 'config/scripts/',
    centralBucket,
    destinationKeyPrefix: 'config/scripts',
  });

  // upload Rsyslog Artifacts
  uploadArtifacts({
    accountStack: masterAccountStack,
    artifactName: 'Rsyslog',
    artifactFolderName: 'rsyslog',
    artifactKeyPrefix: 'rsyslog',
    centralBucket,
    destinationKeyPrefix: 'rsyslog',
  });
}

function uploadArtifacts(props: {
  accountStack: AccountStack;
  artifactName: ArtifactName;
  artifactFolderName: string;
  artifactKeyPrefix: string;
  centralBucket: s3.IBucket;
  destinationKeyPrefix?: string;
}) {
  const {
    accountStack,
    artifactName,
    artifactFolderName,
    artifactKeyPrefix,
    centralBucket,
    destinationKeyPrefix,
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

  // TODO Leave existing files in the folder
  // TODO Do not override existing files
  // See https://github.com/aws/aws-cdk/issues/953
  new s3deployment.BucketDeployment(accountStack, `${artifactName}ArtifactsDeployment${accountKey}`, {
    sources: [s3deployment.Source.asset(artifactsFolderPath)],
    destinationBucket: centralBucket,
    destinationKeyPrefix,
  });

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
}
