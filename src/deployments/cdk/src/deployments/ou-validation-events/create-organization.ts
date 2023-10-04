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

export interface CreateOrganizationalUnitEventProps {
  scope: AccountStack;
  acceleratorPrefix: string;
  acceleratorPipelineRole: iam.IRole;
  lambdaCode: lambda.Code;
  ignoredOus: string[];
  organizationAdminRole: string;
}
export async function createOrganizationalUnit(input: CreateOrganizationalUnitEventProps) {
  const { scope, lambdaCode, acceleratorPipelineRole, acceleratorPrefix, ignoredOus, organizationAdminRole } = input;

  const orgChangeFunc = new lambda.Function(scope, 'organizationChanges', {
    runtime: lambda.Runtime.NODEJS_18_X,
    handler: 'index.ouValidationEvents.createOrganizationalUnit',
    code: lambdaCode,
    role: acceleratorPipelineRole,
    environment: {
      ACCELERATOR_STATEMACHINE_ROLENAME: acceleratorPipelineRole.roleName,
      ACCELERATOR_PREFIX: acceleratorPrefix,
      IGNORED_OUS: ignoredOus.toString(),
      ORGANIZATIONS_ADMIN_ROLE: organizationAdminRole,
    },
    timeout: cdk.Duration.minutes(15),
    memorySize: 512,
  });

  orgChangeFunc.addPermission(`InvokePermission-CreateOrganization_rule`, {
    action: 'lambda:InvokeFunction',
    principal: new iam.ServicePrincipal('events.amazonaws.com'),
  });

  const orgChangeEventPattern = {
    source: ['aws.organizations'],
    'detail-type': ['AWS API Call via CloudTrail'],
    detail: {
      eventSource: ['organizations.amazonaws.com'],
      eventName: ['CreateOrganizationalUnit'],
    },
  };

  const ruleTarget: events.CfnRule.TargetProperty = {
    arn: orgChangeFunc.functionArn,
    id: 'ChangeOrganizationalUnit',
  };

  new events.CfnRule(scope, 'CreateOrganizationEventRule', {
    description: 'Handles Create Organizational Unit and performs respective action.',
    state: 'ENABLED',
    name: createName({
      name: 'CreateOrganizationalUnit_rule',
    }),
    eventPattern: orgChangeEventPattern,
    targets: [ruleTarget],
  });
}
