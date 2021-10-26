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

export interface IamRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

export async function createMacieRoles(props: IamRoleProps): Promise<void> {
  const { accountStacks, config } = props;

  const enableMacie = config['global-options']['central-security-services'].macie;
  // skipping Macie if not enabled from config
  if (!enableMacie) {
    return;
  }

  const masterOrgKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterOrgKey);

  const macieAdminRole = await createMacieAdminRole(masterAccountStack);
  const macieMasterEnableRole = await createMacieEnableRole(masterAccountStack);

  createIamRoleOutput(masterAccountStack, macieAdminRole, 'MacieAdminRole');
  createIamRoleOutput(masterAccountStack, macieMasterEnableRole, 'MacieEnableRole');

  const securityMasterKey = props.config['global-options']['central-security-services'].account;
  const securityMasterStack = props.accountStacks.getOrCreateAccountStack(securityMasterKey);

  const macieEnableRole = await createMacieEnableRole(securityMasterStack);
  const macieUpdateConfigRole = await createMacieUpdateConfigRole(securityMasterStack);
  const macieMemberRole = await createMacieCreateMember(securityMasterStack);

  createIamRoleOutput(securityMasterStack, macieEnableRole, 'MacieEnableRole');
  createIamRoleOutput(securityMasterStack, macieUpdateConfigRole, 'MacieUpdateConfigRole');
  createIamRoleOutput(securityMasterStack, macieMemberRole, 'MacieMemberRole');

  for (const [accountKey, _] of config.getAccountConfigs()) {
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    const exportConfigRole = await createMacieExportConfigRole(accountStack);
    const updateSessionRole = await createMacieUpdateSessionRole(accountStack);

    createIamRoleOutput(accountStack, exportConfigRole, 'MacieExportConfigRole');
    createIamRoleOutput(accountStack, updateSessionRole, 'MacieUpdateSessionRole');
  }
}

export async function createMacieAdminRole(stack: AccountStack) {
  const role = new iam.Role(stack, 'Custom::MacieAdminRole', {
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
      actions: ['macie2:EnableOrganizationAdminAccount', 'macie2:ListOrganizationAdminAccounts'],
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

export async function createMacieEnableRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieEnableRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['iam:CreateServiceLinkedRole'],
      resources: ['*'],
    }),
  );
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:EnableMacie'],
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

export async function createMacieExportConfigRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieExportConfigRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:putClassificationExportConfiguration'],
      resources: ['*'],
    }),
  );
  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: [
        's3:CreateBucket',
        's3:GetBucketLocation',
        's3:ListAllMyBuckets',
        's3:PutBucketAcl',
        's3:PutBucketPolicy',
        's3:PutBucketPublicAccessBlock',
        's3:PutObject',
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

export async function createMacieUpdateConfigRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieUpdateConfigRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:UpdateOrganizationConfiguration'],
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

export async function createMacieUpdateSessionRole(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieUpdateSessionRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:UpdateMacieSession', 'macie2:PutFindingsPublicationConfiguration'],
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

export async function createMacieCreateMember(stack: AccountStack) {
  const role = new iam.Role(stack, `Custom::MacieCreateMemberRole`, {
    assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  });

  role.addToPrincipalPolicy(
    new iam.PolicyStatement({
      actions: ['macie2:CreateMember'],
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
