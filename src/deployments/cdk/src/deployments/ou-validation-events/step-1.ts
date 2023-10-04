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

import * as cdk from 'aws-cdk-lib';
import * as c from '@aws-accelerator/common-config/src';
import { AccountStack } from '../../common/account-stacks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
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
  acceleratorName: string;
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
    acceleratorName,
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
    acceleratorName,
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
    acceleratorName,
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
    acceleratorName,
    acceleratorPrefix,
  } = input;
  const acceleratorStateMachineArn = `arn:aws:states:${defaultRegion}:${scope.accountId}:stateMachine:${acceleratorStateMachineName}`;
  const moveAccountFunc = new lambda.Function(scope, 'moveAccountToOrganization', {
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'index.ouValidationEvents.moveAccount',
    code: lambdaCode,
    role: acceleratorPipelineRole,
    environment: {
      CONFIG_REPOSITORY_NAME: configRepositoryName,
      CONFIG_FILE_PATH: configFilePath,
      CONFIG_BRANCH_NAME: configBranch,
      ACCELERATOR_STATEMACHINE_ROLENAME: acceleratorPipelineRole.roleName,
      ACCELERATOR_STATE_MACHINE_ARN: acceleratorStateMachineArn,
      CONFIG_ROOT_FILE_PATH: configRootFilePath,
      ACCELERATOR_NAME: acceleratorName,
      ACCELERATOR_PREFIX: acceleratorPrefix,
      ACCELERATOR_DEFAULT_REGION: defaultRegion,
    },
    timeout: cdk.Duration.minutes(15),
    memorySize: 512,
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
