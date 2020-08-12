import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { LogBucketOutput } from '../defaults/outputs';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { CreateCloudTrail } from '@custom-resources/create-cloud-trail';
import { Organizations } from '@custom-resources/organization';
import { LogGroup } from '@custom-resources/logs-log-group';
import {
  createLogGroupName,
  createRoleName,
  createName,
} from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import * as iam from '@aws-cdk/aws-iam';
import { Context } from '../../utils/context';
import { AccountBuckets } from '../defaults';

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
  console.log('organizationId', organizationId);

  const logGroup = new LogGroup(masterAccountStack, `LogGroup${masterAccountKey}`, {
    logGroupName: createLogGroupName('CloudTrail', 0),
  });

  const cloudTrailLogGroupRole = new iam.Role(masterAccountStack, `TrailLogGroupRole${masterAccountKey}`, {
    roleName: createRoleName('CT-to-CWL'),
    assumedBy: new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
  });

  cloudTrailLogGroupRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogStream'],
      resources: [
        logGroup.logGroupArn,
        `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${logGroup.logGroupName}:log-stream:${organizationId}_*`,
      ],
    }),
  );

  cloudTrailLogGroupRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:PutLogEvents'],
      resources: [
        logGroup.logGroupArn,
        `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${logGroup.logGroupName}:log-stream:${organizationId}_*`,
      ],
    }),
  );

  const createCloudTrail = new CreateCloudTrail(masterAccountStack, `CreateCloudTrail${masterAccountKey}`, {
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
  });
  createCloudTrail.node.addDependency(cloudTrailLogGroupRole);
}
