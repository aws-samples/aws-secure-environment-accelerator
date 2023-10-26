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
import { AccountStack } from '../../common/account-stacks';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { Context } from '../../utils/context';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { CodeTask } from '@aws-accelerator/cdk-accelerator/src/stepfunction-tasks';

export interface PolicyChangeEventProps {
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
    acceleratorName,
  } = input;

  const policyChangeFunc = new lambda.Function(scope, 'policyChanges', {
    runtime: lambda.Runtime.NODEJS_18_X,
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
      ACCELERATOR_NAME: acceleratorName,
    },
    timeout: cdk.Duration.minutes(15),
    memorySize: 512,
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
      eventName: ['UpdatePolicy', 'DeletePolicy', 'DetachPolicy', 'AttachPolicy'],
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
