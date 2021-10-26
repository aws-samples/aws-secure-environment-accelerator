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

import * as iam from '@aws-cdk/aws-iam';
import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { createIamRoleOutput } from './outputs';
import { IamRoleProps } from './macie-roles';

export async function createGuardDutyRoles(props: IamRoleProps): Promise<void> {
  const { accountStacks, config } = props;
  const enableGuardDuty = config['global-options']['central-security-services'].guardduty;

  // skipping Guardduty if not enabled from config
  if (!enableGuardDuty) {
    return;
  }

  const masterOrgKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterOrgKey);
  const guardDutyAdminRole = await createAdminRole(masterAccountStack);
  createIamRoleOutput(masterAccountStack, guardDutyAdminRole, 'GuardDutyAdminRole');

  const securityMasterKey = props.config['global-options']['central-security-services'].account;
  const securityMasterStack = props.accountStacks.getOrCreateAccountStack(securityMasterKey);
  const guardDutyAdminSetupRole = await createAdminSetupRole(securityMasterStack);
  createIamRoleOutput(securityMasterStack, guardDutyAdminSetupRole, 'GuardDutyAdminSetupRole');

  for (const [accountKey, _] of config.getAccountConfigs()) {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    const detectorRole = await createGetDetectorRole(accountStack);
    const publishRole = await createPublishRole(accountStack);

    createIamRoleOutput(accountStack, detectorRole, 'GuardDutyDetectorRole');
    createIamRoleOutput(accountStack, publishRole, 'GuardDutyPublishRole');
  }
}

export async function createAdminRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::GuardDutyAdminRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['organizations:*'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'guardduty:EnableOrganizationAdminAccount',
        'guardduty:ListOrganizationAdminAccounts',
        'guardduty:ListDetectors',
        'guardduty:createDetector',
        'iam:CreateServiceLinkedRole',
      ],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createAdminSetupRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::GuardDutyAdminSetupRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'guardduty:ListDetectors',
        'guardduty:CreateMembers',
        'guardduty:UpdateOrganizationConfiguration',
        'guardduty:DescribeOrganizationConfiguration',
        'guardduty:UpdateMemberDetectors',
        'guardduty:DeleteMembers',
        'guardduty:UpdateDetector',
        'guardduty:ListMembers',
      ],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createGetDetectorRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::GetDetectorIdRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['guardduty:ListDetectors'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}

export async function createPublishRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::GuardDutyCreatePublishRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:CreateBucket',
        's3:GetBucketLocation',
        's3:ListAllMyBuckets',
        's3:PutBucketAcl',
        's3:PutBucketPublicAccessBlock',
        's3:PutBucketPolicy',
        's3:PutObject',
      ],
      resources: ['*'],
    }),
  );
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        'guardduty:createPublishingDestination',
        'guardduty:updatePublishingDestination',
        'guardduty:deletePublishingDestination',
        'guardduty:listPublishingDestinations',
      ],
      resources: ['*'],
    }),
  );
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['kms:ListAliases'],
      resources: ['*'],
    }),
  );

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: ['*'],
    }),
  );
  return role;
}
