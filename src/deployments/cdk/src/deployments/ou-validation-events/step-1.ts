import * as cdk from '@aws-cdk/core';
import * as c from '@aws-accelerator/common-config/src';
import { AccountStack } from '../../common/account-stacks';
import * as lambda from '@aws-cdk/aws-lambda';
import * as path from 'path';
import * as iam from '@aws-cdk/aws-iam';
import * as events from '@aws-cdk/aws-events';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { Context } from '../../utils/context';

import { createAccount } from './create-account';
import { changePolicy } from './policy-changes';
import { removeAccount } from './remove-account';
import { createOrganizationalUnit } from './create-organization';

export interface OuValidationStep1Props {
  scope: AccountStack;
  context: Context;
  scpBucketName: string;
  scpBucketPrefix: string;
  ignoredOus: string[];
  organizationAdminRole: string;
}

export interface MoveAccountProps {
  scope: AccountStack;
  acceleratorPrefix: string;
  configBranch: string;
  configFilePath: string;
  configRepositoryName: string;
  defaultRegion: string;
  acceleratorPipelineRole: iam.IRole;
  lambdaCode: lambda.Code;
  acceleratorStateMachineName: string;
  configRootFilePath: string;
}

/**
 * OU Validation - Handling manual account creation and move account to organizations
 */
export async function step1(props: OuValidationStep1Props) {
  const { scope, context, scpBucketName, scpBucketPrefix, ignoredOus, organizationAdminRole } = props;
  const {
    acceleratorPipelineRoleName,
    acceleratorPrefix,
    configBranch,
    configFilePath,
    configRepositoryName,
    defaultRegion,
    acceleratorStateMachineName,
    configRootFilePath,
  } = context;
  const lambdaPath = require.resolve('@aws-accelerator/deployments-runtime');
  const lambdaDir = path.dirname(lambdaPath);
  const lambdaCode = lambda.Code.fromAsset(lambdaDir);
  const roleArn = `arn:aws:iam::${scope.accountId}:role/${acceleratorPipelineRoleName}`;
  const acceleratorPipelineRole = iam.Role.fromRoleArn(scope, 'OuValidationRole', roleArn, {
    mutable: true,
  });

  // Creates resource needed for handling create account directly from console
  await createAccount({
    scope,
    acceleratorPipelineRole,
    acceleratorPrefix,
    configBranch,
    configFilePath,
    configRepositoryName,
    defaultRegion,
    lambdaCode,
    acceleratorStateMachineName,
    organizationAdminRole,
  });
  // Creates resources needed for handling move account directly from console
  await moveAccount({
    scope,
    acceleratorPipelineRole,
    acceleratorPrefix,
    configBranch,
    configFilePath,
    configRepositoryName,
    defaultRegion,
    lambdaCode,
    acceleratorStateMachineName,
    configRootFilePath,
  });

  // Creates resource needed for handling create account directly from console
  await changePolicy({
    scope,
    acceleratorPipelineRole,
    acceleratorPrefix,
    configBranch,
    configFilePath,
    configRepositoryName,
    defaultRegion,
    lambdaCode,
    acceleratorStateMachineName,
    scpBucketName,
    scpBucketPrefix,
    organizationAdminRole,
  });

  // Handles RemoveAccountFromOrganization and removes WorkLoadAccount Configuration from configuration file
  await removeAccount({
    scope,
    acceleratorPipelineRole,
    acceleratorPrefix,
    configBranch,
    configFilePath,
    configRepositoryName,
    defaultRegion,
    lambdaCode,
    configRootFilePath,
  });

  await createOrganizationalUnit({
    scope,
    acceleratorPipelineRole,
    acceleratorPrefix,
    ignoredOus,
    lambdaCode,
    organizationAdminRole,
  });
}

async function moveAccount(input: MoveAccountProps) {
  const {
    scope,
    acceleratorPipelineRole,
    configBranch,
    configFilePath,
    configRepositoryName,
    defaultRegion,
    lambdaCode,
    acceleratorStateMachineName,
    configRootFilePath,
  } = input;
  const acceleratorStateMachineArn = `arn:aws:states:${defaultRegion}:${scope.accountId}:stateMachine:${acceleratorStateMachineName}`;
  const moveAccountFunc = new lambda.Function(scope, 'moveAccountToOrganization', {
    runtime: lambda.Runtime.NODEJS_12_X,
    handler: 'index.ouValidationEvents.moveAccount',
    code: lambdaCode,
    role: acceleratorPipelineRole,
    environment: {
      CONFIG_REPOSITORY_NAME: configRepositoryName,
      CONFIG_FILE_PATH: configFilePath,
      CONFIG_BRANCH_NAME: configBranch,
      ACCELERATOR_STATEMACHINE_ROLENAME: acceleratorPipelineRole.roleName,
      ACCELERATOR_DEFAULT_REGION: defaultRegion,
      ACCELERATOR_STATE_MACHINE_ARN: acceleratorStateMachineArn,
      CONFIG_ROOT_FILE_PATH: configRootFilePath,
    },
    timeout: cdk.Duration.minutes(15),
  });

  moveAccountFunc.addPermission(`InvokePermission-MoveAccount_rule`, {
    action: 'lambda:InvokeFunction',
    principal: new iam.ServicePrincipal('events.amazonaws.com'),
  });

  const moveAccountEventPattern = {
    source: ['aws.organizations'],
    'detail-type': ['AWS API Call via CloudTrail'],
    detail: {
      eventSource: ['organizations.amazonaws.com'],
      eventName: ['MoveAccount'],
    },
  };

  const ruleTarget: events.CfnRule.TargetProperty = {
    arn: moveAccountFunc.functionArn,
    id: 'MoveAccountToOrganizationRule',
  };

  new events.CfnRule(scope, 'MoveAccountToOrganizationRule', {
    description: 'Adds Account Configuration to config file on successful moveAccount',
    state: 'ENABLED',
    name: createName({
      name: 'MoveAccount_rule',
    }),
    eventPattern: moveAccountEventPattern,
    targets: [ruleTarget],
  });
}
