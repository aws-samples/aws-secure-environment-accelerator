import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { LogBucketOutputType } from '../defaults/outputs';
import { StackOutput, getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { CreateCloudTrail } from '@custom-resources/create-cloud-trail';
import { Organizations } from '@custom-resources/organization';
import { LogGroup } from '@custom-resources/logs-log-group';
import { createLogGroupName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import * as iam from '@aws-cdk/aws-iam';
import { Context } from '../../utils/context';
import { StructuredOutput } from '../../common/structured-output';

export interface CreateCloudTrailProps {
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
  const { accountStacks, config, outputs, context } = props;

  const logAccountKey = config.getMandatoryAccountKey('central-log');
  const logBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
    accountKey: logAccountKey,
    type: LogBucketOutputType,
  });
  const logBucketOutput = logBucketOutputs?.[0];
  if (!logBucketOutput) {
    throw new Error(`Cannot find central log bucket for log account ${logAccountKey}`);
  }

  const s3KmsKeyArn = getStackOutput(outputs, logAccountKey, outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN);
  console.log('AWS S3 Bucket KMS Key ARN: ' + s3KmsKeyArn);
  if (!s3KmsKeyArn) {
    console.warn(`cannot found LogArchive account KMS key Arn`);
    return;
  }

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  const organizations = new Organizations(masterAccountStack, 'Organizations');
  const organizationId = organizations.organizationId;
  console.log('organizationId', organizationId);

  const logGroup = new LogGroup(masterAccountStack, `LogGroup${masterAccountKey}`, {
    logGroupName: createLogGroupName('CloudTrail', 0),
  });

  const cloudTrailLogGroupRole = new iam.Role(masterAccountStack, `TrailLogGroupRole${masterAccountKey}`, {
    roleName: 'PBMMAccel-CT-to-CWL',
    assumedBy: new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
  });

  cloudTrailLogGroupRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogStream'],
      resources: [
        logGroup.logGroupArn,
        `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${logGroup.logGroupName}:log-stream:${organizationId}_*`,
      ],
    }),
  );

  cloudTrailLogGroupRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ['logs:PutLogEvents'],
      resources: [
        logGroup.logGroupArn,
        `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${logGroup.logGroupName}:log-stream:${organizationId}_*`,
      ],
    }),
  );

  const createCloudTrail = new CreateCloudTrail(masterAccountStack, `CreateCloudTrail${masterAccountKey}`, {
    cloudTrailName: 'PBMMAccel-Org-Trail',
    bucketName: logBucketOutput.bucketName,
    logGroupArn: logGroup.logGroupArn,
    roleArn: cloudTrailLogGroupRole.roleArn,
    kmsKeyId: s3KmsKeyArn,
    s3KeyPrefix: organizationId,
    tagName: 'Accelerator',
    tagValue: context.acceleratorName,
  });
  createCloudTrail.node.addDependency(cloudTrailLogGroupRole);
}
