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

import * as c from '@aws-accelerator/common-config/src';
import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnIamRoleOutput } from './outputs';
import * as s3 from '@aws-cdk/aws-s3';

export interface CwlCentralLoggingRoleProps {
  acceleratorPrefix: string;
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  logBucket: s3.IBucket;
}

export async function createCwlCentralLoggingRoles(props: CwlCentralLoggingRoleProps): Promise<void> {
  const { accountStacks, config, acceleratorPrefix, logBucket } = props;
  const centralLoggingServices = config['global-options']['central-log-services'];

  const cwlRegions = Object.entries(config['global-options']['additional-cwl-regions']).map(([region, _]) => region);
  if (!cwlRegions.includes(centralLoggingServices.region)) {
    cwlRegions.push(centralLoggingServices.region);
  }

  const accountStack = accountStacks.tryGetOrCreateAccountStack(
    centralLoggingServices.account,
    centralLoggingServices.region,
  );
  if (!accountStack) {
    console.error(
      `Not able to create stack for "${centralLoggingServices.account}:${centralLoggingServices.region}" whicle creating role for CWL Central logging`,
    );
    return;
  }
  // Create IAM Role for reading logs from stream and push to destination
  const logsRole = new iam.Role(accountStack, 'CloudWatch-Logs-Stream-Role', {
    roleName: createRoleName('CWL-Logs-Stream-Role'),
    assumedBy: new iam.CompositePrincipal(...cwlRegions.map(r => new iam.ServicePrincipal(`logs.${r}.amazonaws.com`))),
  });

  // Create IAM Policy for reading logs from stream and push to destination
  new iam.Policy(accountStack, 'CWL-Logs-Stream-Policy', {
    roles: [logsRole],
    statements: [
      new iam.PolicyStatement({
        resources: [`arn:aws:kinesis:*:${accountStack.accountId}:stream/${acceleratorPrefix}*`],
        actions: ['kinesis:PutRecord'],
      }),
      new iam.PolicyStatement({
        resources: [logsRole.roleArn],
        actions: ['iam:PassRole'],
      }),
    ],
  });

  // Creating IAM role for Kinesis Delivery Stream Role
  const kinesisStreamRole = new iam.Role(accountStack, 'CWL-Kinesis-Stream-Role', {
    roleName: createRoleName('Kinesis-Stream-Role'),
    assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
  });

  new iam.Policy(accountStack, 'CWL-Kinesis-Stream-Policy', {
    roles: [kinesisStreamRole],
    statements: [
      new iam.PolicyStatement({
        resources: [logBucket.encryptionKey?.keyArn!],
        actions: ['kms:DescribeKey', 'kms:GenerateDataKey*', 'kms:Decrypt', 'kms:Encrypt', 'kms:ReEncrypt*'],
      }),
      new iam.PolicyStatement({
        resources: [logBucket.bucketArn, `${logBucket.bucketArn}/*`],
        actions: [
          's3:PutObject',
          's3:PutObjectAcl',
          's3:GetEncryptionConfiguration',
          's3:AbortMultipartUpload',
          's3:GetBucketLocation',
          's3:GetObject',
          's3:ListBucket',
          's3:ListBucketMultipartUploads',
          's3:PutObject',
        ],
      }),
      new iam.PolicyStatement({
        resources: ['*'],
        actions: ['kinesis:DescribeStream', 'kinesis:GetShardIterator', 'kinesis:GetRecords', 'kinesis:ListShards'],
      }),
      new iam.PolicyStatement({
        resources: ['arn:aws:logs:*:*:*'],
        actions: ['logs:PutLogEvents'],
      }),
    ],
  });

  new CfnIamRoleOutput(accountStack, `CWLLogsStreamRoleOutput`, {
    roleName: logsRole.roleName,
    roleArn: logsRole.roleArn,
    roleKey: 'CWLLogsStreamRole',
  });

  new CfnIamRoleOutput(accountStack, `CWLKinesisStreamRoleOutput`, {
    roleName: kinesisStreamRole.roleName,
    roleArn: kinesisStreamRole.roleArn,
    roleKey: 'CWLKinesisStreamRole',
  });
}
