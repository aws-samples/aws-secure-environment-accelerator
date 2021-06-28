import * as cdk from '@aws-cdk/core';
import { AccountStack } from '../../common/account-stacks';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import * as events from '@aws-cdk/aws-events';
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
    runtime: lambda.Runtime.NODEJS_12_X,
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
    deadLetterQueueEnabled: true,
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
