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

import * as cdk from '@aws-cdk/core';
import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { LogBucketOutput } from '../defaults/outputs';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { CreateCloudTrail } from '@aws-accelerator/custom-resource-cloud-trail';
import { Organizations } from '@aws-accelerator/custom-resource-organization';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import {
  createLogGroupName,
  createRoleName,
  createName,
} from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import * as iam from '@aws-cdk/aws-iam';
import { Context } from '../../utils/context';
import { AccountBuckets } from '../defaults';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';

export interface CreateCloudTrailProps {
  accountBuckets: AccountBuckets;
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  context: Context;
}

/**
 *
 *  Create CloudTrail - Trail
 *
 */
export async function step1(props: CreateCloudTrailProps) {
  const { accountBuckets, accountStacks, config, outputs, context } = props;
  if (context.acceleratorBaseline !== 'ORGANIZATIONS' && !config['global-options']['separate-s3-dp-org-trail']) {
    return;
  }
  const logAccountKey = config.getMandatoryAccountKey('central-log');
  const logBucket = accountBuckets[logAccountKey];
  if (!logBucket) {
    throw new Error(`Cannot find central log bucket for log account ${logAccountKey}`);
  }

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);
  if (!masterAccountStack) {
    throw new Error(`Cannot find account stack ${masterAccountKey}`);
  }

  const organizations = new Organizations(masterAccountStack, 'Organizations');
  const organizationId = organizations.organizationId;

  const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: masterAccountKey,
    roleKey: 'LogGroupRole',
  });
  if (!logGroupLambdaRoleOutput) {
    return;
  }

  const cloudTrailLogGroupRole = new iam.Role(masterAccountStack, `TrailLogGroupRole${masterAccountKey}`, {
    roleName: createRoleName('CT-to-CWL'),
    assumedBy: new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
  });

  const logGroups: LogGroup[] = [];
  if (context.acceleratorBaseline === 'ORGANIZATIONS') {
    const logGroup = new LogGroup(masterAccountStack, `LogGroup${masterAccountKey}`, {
      logGroupName: createLogGroupName('CloudTrail', 0),
      roleArn: logGroupLambdaRoleOutput.roleArn,
    });
    const createCloudTrail = new CreateCloudTrail(masterAccountStack, `CreateCloudTrail-${masterAccountKey}`, {
      cloudTrailName: createName({
        name: 'Org-Trail',
      }),
      bucketName: logBucket.bucketName,
      logGroupArn: logGroup.logGroupArn,
      roleArn: cloudTrailLogGroupRole.roleArn,
      kmsKeyId: logBucket.encryptionKey!.keyArn,
      s3KeyPrefix: organizationId,
      tagName: 'Accelerator',
      tagValue: context.acceleratorName,
      managementEvents: true,
      s3Events: true,
    });
    createCloudTrail.node.addDependency(cloudTrailLogGroupRole);
    logGroups.push(logGroup);
  }

  if (config['global-options']['separate-s3-dp-org-trail']) {
    const logGroup = new LogGroup(masterAccountStack, `LogGroup-S3-${masterAccountKey}`, {
      logGroupName: createLogGroupName('CloudTrailS3', 0),
      roleArn: logGroupLambdaRoleOutput.roleArn,
    });
    const createCloudTrail = new CreateCloudTrail(masterAccountStack, `CreateCloudTrailS3-${masterAccountKey}`, {
      cloudTrailName: createName({
        name: 'Org-Trail-S3',
      }),
      bucketName: logBucket.bucketName,
      logGroupArn: logGroup.logGroupArn,
      roleArn: cloudTrailLogGroupRole.roleArn,
      kmsKeyId: logBucket.encryptionKey!.keyArn,
      s3KeyPrefix: organizationId,
      tagName: 'Accelerator',
      tagValue: context.acceleratorName,
      managementEvents: false,
      s3Events: true,
    });
    createCloudTrail.node.addDependency(cloudTrailLogGroupRole);
    logGroups.push(logGroup);
  }

  cloudTrailLogGroupRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogStream'],
      resources: [
        ...logGroups.map(lg => lg.logGroupArn),
        ...logGroups.map(
          lg =>
            `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${lg.logGroupName}:log-stream:${organizationId}_*`,
        ),
      ],
    }),
  );

  cloudTrailLogGroupRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:PutLogEvents'],
      resources: [
        ...logGroups.map(lg => lg.logGroupArn),
        ...logGroups.map(
          lg =>
            `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${lg.logGroupName}:log-stream:${organizationId}_*`,
        ),
      ],
    }),
  );
}
