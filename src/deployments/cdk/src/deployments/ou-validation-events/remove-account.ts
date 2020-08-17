import { AccountStack } from '../../common/account-stacks';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cdk from '@aws-cdk/core';
import * as events from '@aws-cdk/aws-events';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';

export interface RemoveAccountProps {
  scope: AccountStack;
  acceleratorPrefix: string;
  configBranch: string;
  configFilePath: string;
  configRepositoryName: string;
  defaultRegion: string;
  acceleratorPipelineRole: iam.IRole;
  lambdaCode: lambda.Code;
  configRootFilePath: string;
}

export async function removeAccount(input: RemoveAccountProps) {
  const {
    scope,
    acceleratorPipelineRole,
    configBranch,
    configFilePath,
    configRepositoryName,
    defaultRegion,
    lambdaCode,
    configRootFilePath,
  } = input;

  const removeAccountFunc = new lambda.Function(scope, 'removeAccountFromOrganization', {
    runtime: lambda.Runtime.NODEJS_12_X,
    handler: 'index.ouValidationEvents.removeAccount',
    code: lambdaCode,
    role: acceleratorPipelineRole,
    environment: {
      CONFIG_REPOSITORY_NAME: configRepositoryName,
      CONFIG_FILE_PATH: configFilePath,
      CONFIG_BRANCH_NAME: configBranch,
      ACCELERATOR_STATEMACHINE_ROLENAME: acceleratorPipelineRole.roleName,
      ACCELERATOR_DEFAULT_REGION: defaultRegion,
      // TODO Remove hardcoded of accounts secret
      ACCOUNTS_SECRET_ID: 'accelerator/accounts',
      CONFIG_ROOT_FILE_PATH: configRootFilePath,
    },
    timeout: cdk.Duration.minutes(15),
  });

  removeAccountFunc.addPermission(`InvokePermission-RemoveAccount_rule`, {
    action: 'lambda:InvokeFunction',
    principal: new iam.ServicePrincipal('events.amazonaws.com'),
  });

  const removeAccountEventPattern = {
    source: ['aws.organizations'],
    'detail-type': ['AWS API Call via CloudTrail'],
    detail: {
      eventSource: ['organizations.amazonaws.com'],
      eventName: ['RemoveAccountFromOrganization'],
    },
  };

  const ruleTarget: events.CfnRule.TargetProperty = {
    arn: removeAccountFunc.functionArn,
    id: 'RemoveAccountFromOrganizationRule',
  };

  new events.CfnRule(scope, 'RemoveAccountFromOrganizationRule', {
    description: 'Removes Account Configuration from config file on successful removeAccount',
    state: 'ENABLED',
    name: createName({
      name: 'RemoveAccount_rule',
    }),
    eventPattern: removeAccountEventPattern,
    targets: [ruleTarget],
  });
}
