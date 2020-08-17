import * as cdk from '@aws-cdk/core';
import { AccountStack } from '../../common/account-stacks';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as events from '@aws-cdk/aws-events';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { Context } from '../../utils/context';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';

export interface PolicyChangeEventProps {
  scope: AccountStack;
  acceleratorPrefix: string;
  configBranch: string;
  configFilePath: string;
  configRepositoryName: string;
  defaultRegion: string;
  acceleratorPipelineRole: iam.IRole;
  lambdaCode: lambda.Code;
  acceleratorStateMachineName: string;
  scpBucketName: string;
  scpBucketPrefix: string;
  organizationAdminRole: string;
}
export async function changePolicy(input: PolicyChangeEventProps) {
  const {
    scope,
    lambdaCode,
    acceleratorPipelineRole,
    acceleratorPrefix,
    defaultRegion,
    configRepositoryName,
    configFilePath,
    configBranch,
    scpBucketName,
    scpBucketPrefix,
    organizationAdminRole,
  } = input;

  const policyChangeFunc = new lambda.Function(scope, 'policyChanges', {
    runtime: lambda.Runtime.NODEJS_12_X,
    handler: 'index.ouValidationEvents.changePolicy',
    code: lambdaCode,
    role: acceleratorPipelineRole,
    environment: {
      CONFIG_REPOSITORY_NAME: configRepositoryName,
      CONFIG_FILE_PATH: configFilePath,
      CONFIG_BRANCH_NAME: configBranch,
      ACCELERATOR_STATEMACHINE_ROLENAME: acceleratorPipelineRole.roleName,
      ACCELERATOR_DEFAULT_REGION: defaultRegion,
      ACCELERATOR_PREFIX: acceleratorPrefix,
      ACCELERATOR_SCP_BUCKET_PREFIX: scpBucketPrefix,
      ACCELERATOR_SCP_BUCKET_NAME: scpBucketName,
      ORGANIZATIONS_ADMIN_ROLE: organizationAdminRole,
    },
    timeout: cdk.Duration.minutes(15),
  });

  policyChangeFunc.addPermission(`InvokePermission-ChangePolicy_rule`, {
    action: 'lambda:InvokeFunction',
    principal: new iam.ServicePrincipal('events.amazonaws.com'),
  });

  const changePolicytEventPattern = {
    source: ['aws.organizations'],
    'detail-type': ['AWS API Call via CloudTrail'],
    detail: {
      eventSource: ['organizations.amazonaws.com'],
      eventName: ['UpdatePolicy', 'DeletePolicy', 'DetachPolicy'],
    },
  };

  const ruleTarget: events.CfnRule.TargetProperty = {
    arn: policyChangeFunc.functionArn,
    id: 'SCPChangesOrganizations',
  };

  new events.CfnRule(scope, 'PolicyChangesEventRule', {
    description: 'Recreates SCP from configuration on manual policy change other than Accelerator execution',
    state: 'ENABLED',
    name: createName({
      name: 'PolicyChanges_rule',
    }),
    eventPattern: changePolicytEventPattern,
    targets: [ruleTarget],
  });
}
