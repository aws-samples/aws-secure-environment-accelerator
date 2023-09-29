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

import { AccountStack } from '../../common/account-stacks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
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
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'index.ouValidationEvents.removeAccount',
    code: lambdaCode,
    role: acceleratorPipelineRole,
    environment: {
      CONFIG_REPOSITORY_NAME: configRepositoryName,
      CONFIG_FILE_PATH: configFilePath,
      CONFIG_BRANCH_NAME: configBranch,
      ACCELERATOR_STATEMACHINE_ROLENAME: acceleratorPipelineRole.roleName,
      ACCELERATOR_DEFAULT_REGION: defaultRegion,
      PARAMETERS_TABLE_NAME: process.env.DYNAMODB_PARAMETERS_TABLE_NAME!,
      CONFIG_ROOT_FILE_PATH: configRootFilePath,
    },
    timeout: cdk.Duration.minutes(15),
    memorySize: 512,
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
