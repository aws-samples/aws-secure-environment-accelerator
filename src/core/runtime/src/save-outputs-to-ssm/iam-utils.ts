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

import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamConfig, AccountConfig, AcceleratorConfig } from '@aws-accelerator/common-config';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { IamGroupOutputFinder, IamUserOutputFinder } from '@aws-accelerator/common-outputs/src/iam-users';
import { IamPolicyOutputFinder, IamRoleNameOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { OutputUtilGenericType } from './utils';

export async function prepareMandatoryAccountIamConfigs(
  accountsIamConfig: { [accountKey: string]: IamConfig[] },
  accountConfig: [string, AccountConfig] | undefined,
) {
  if (!accountConfig) {
    return;
  }
  const iamConfig = accountConfig[1].iam;
  if (!iamConfig) {
    return;
  }
  if (!accountsIamConfig[accountConfig[0]]) {
    accountsIamConfig[accountConfig[0]] = [iamConfig];
  } else {
    accountsIamConfig[accountConfig[0]].push(iamConfig);
  }
}

export async function prepareOuAccountIamConfigs(
  config: AcceleratorConfig,
  account: Account,
  accountsIamConfig: { [accountKey: string]: IamConfig[] },
) {
  const orgUnits = config.getOrganizationalUnits();
  const ouConfig = orgUnits.find(([orgName, _]) => orgName === account.ou);
  if (!ouConfig) {
    return;
  }
  const iamConfig = ouConfig[1].iam;
  if (!iamConfig) {
    return;
  }

  if (!accountsIamConfig[account.key]) {
    accountsIamConfig[account.key] = [iamConfig];
  } else {
    const iamConfigs = accountsIamConfig[account.key];
    iamConfigs.push(iamConfig);
    accountsIamConfig[account.key] = iamConfigs;
  }
}

export async function saveIamUsers(
  iamConfigs: IamConfig[],
  outputs: StackOutput[],
  ssm: SSM,
  accountKey: string,
  acceleratorPrefix: string,
  users: OutputUtilGenericType[],
): Promise<OutputUtilGenericType[]> {
  const userIndices = users.flatMap(r => r.index) || [];
  console.log('userIndices', userIndices);
  let userMaxIndex = userIndices.length === 0 ? 0 : Math.max(...userIndices);
  const updatedUsers: OutputUtilGenericType[] = [];
  const removalObjects: OutputUtilGenericType[] = [...(users || [])];

  for (const iamConfig of iamConfigs) {
    if (!iamConfig || !iamConfig.users) {
      continue;
    }

    const userIds = iamConfig.users.flatMap(u => u['user-ids']);
    console.log('userIds', userIds);
    for (const user of userIds) {
      const userOutput = IamUserOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        userKey: 'IamAccountUser',
        userName: user,
      });
      if (!userOutput) {
        console.warn(`Didn't find IAM User "${user}" in output`);
        continue;
      }

      let currentIndex: number;
      const previousGroupIndexDetails = users.findIndex(p => p.name === userOutput.userName);
      if (previousGroupIndexDetails >= 0) {
        currentIndex = users[previousGroupIndexDetails].index;
        console.log(`skipping creation of user ${userOutput.userName} in SSM`);
      } else {
        currentIndex = ++userMaxIndex;
        await ssm.putParameter(`/${acceleratorPrefix}/ident/user/${currentIndex}/name`, `${userOutput.userName}`);
        await ssm.putParameter(`/${acceleratorPrefix}/ident/user/${currentIndex}/arn`, userOutput.userArn);
        users.push({
          name: userOutput.userName,
          index: currentIndex,
        });
      }
      updatedUsers.push({
        index: currentIndex,
        name: userOutput.userName,
      });

      const removalIndex = removalObjects.findIndex(p => p.name === userOutput.userName);
      if (removalIndex !== -1) {
        removalObjects.splice(removalIndex, 1);
      }
    }
  }

  for (const removeObject of removalObjects || []) {
    const removalUsers = [
      `/${acceleratorPrefix}/ident/user/${removeObject.index}/name`,
      `/${acceleratorPrefix}/ident/user/${removeObject.index}/arn`,
    ].flatMap(s => s);

    while (removalUsers.length > 0) {
      await ssm.deleteParameters(removalUsers.splice(0, 10));
    }
  }
  return updatedUsers;
}

export async function saveIamGroups(
  iamConfigs: IamConfig[],
  outputs: StackOutput[],
  ssm: SSM,
  accountKey: string,
  acceleratorPrefix: string,
  groups: OutputUtilGenericType[],
): Promise<OutputUtilGenericType[]> {
  const groupIndices = groups.flatMap(r => r.index) || [];
  console.log('groupIndices', groupIndices);
  let policyMaxIndex = groupIndices.length === 0 ? 0 : Math.max(...groupIndices);
  const updatedGroups: OutputUtilGenericType[] = [];
  const removalObjects: OutputUtilGenericType[] = [...(groups || [])];

  for (const iamConfig of iamConfigs) {
    if (!iamConfig || !iamConfig.users) {
      continue;
    }

    const groupIds = iamConfig.users.flatMap(u => u.group);
    console.log('groupIds', groupIds);
    for (const group of groupIds) {
      const groupOutput = IamGroupOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        groupKey: 'IamAccountGroup',
        groupName: group,
      });
      if (!groupOutput) {
        console.warn(`Didn't find IAM user group "${group}" in output`);
        continue;
      }

      let currentIndex: number;
      const previousGroupIndexDetails = groups.findIndex(p => p.name === groupOutput.groupName);
      if (previousGroupIndexDetails >= 0) {
        currentIndex = groups[previousGroupIndexDetails].index;
        console.log(`skipping creation of group ${groupOutput.groupName} in SSM`);
      } else {
        currentIndex = ++policyMaxIndex;
        await ssm.putParameter(`/${acceleratorPrefix}/ident/group/${currentIndex}/name`, `${groupOutput.groupName}`);
        await ssm.putParameter(`/${acceleratorPrefix}/ident/group/${currentIndex}/arn`, groupOutput.groupArn);
        groups.push({
          name: groupOutput.groupName,
          index: currentIndex,
        });
      }
      updatedGroups.push({
        index: currentIndex,
        name: groupOutput.groupName,
      });

      const removalIndex = removalObjects.findIndex(p => p.name === groupOutput.groupName);
      if (removalIndex !== -1) {
        removalObjects.splice(removalIndex, 1);
      }
    }
  }

  for (const removeObject of removalObjects || []) {
    const removalGroups = [
      `/${acceleratorPrefix}/ident/group/${removeObject.index}/name`,
      `/${acceleratorPrefix}/ident/group/${removeObject.index}/arn`,
    ].flatMap(s => s);

    while (removalGroups.length > 0) {
      await ssm.deleteParameters(removalGroups.splice(0, 10));
    }
  }
  return updatedGroups;
}

export async function saveIamPolicy(
  iamConfigs: IamConfig[],
  outputs: StackOutput[],
  ssm: SSM,
  accountKey: string,
  acceleratorPrefix: string,
  policies: OutputUtilGenericType[],
): Promise<OutputUtilGenericType[]> {
  const policyIndices = policies.flatMap(r => r.index) || [];
  console.log('policyIndices', policyIndices);
  let policyMaxIndex = policyIndices.length === 0 ? 0 : Math.max(...policyIndices);
  const updatedPolicies: OutputUtilGenericType[] = [];
  const removalObjects: OutputUtilGenericType[] = [...(policies || [])];

  for (const iamConfig of iamConfigs) {
    if (!iamConfig || !iamConfig.policies) {
      continue;
    }

    const policyIds = iamConfig.policies.flatMap(p => p['policy-name']);
    console.log('policyIds', policyIds);
    for (const policy of policyIds) {
      const policyOutput = IamPolicyOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        policyKey: 'IamCustomerManagedPolicy',
        policyName: policy,
      });
      if (!policyOutput) {
        console.warn(`Didn't find IAM Policy "${policy}" in output`);
        continue;
      }
      let currentIndex: number;
      const previousPolicyIndexDetails = policies.findIndex(p => p.name === policyOutput.policyName);
      if (previousPolicyIndexDetails >= 0) {
        currentIndex = policies[previousPolicyIndexDetails].index;
        console.log(`skipping creation of policy ${policyOutput.policyName} in SSM`);
      } else {
        currentIndex = ++policyMaxIndex;
        await ssm.putParameter(`/${acceleratorPrefix}/ident/policy/${currentIndex}/name`, `${policyOutput.policyName}`);
        await ssm.putParameter(`/${acceleratorPrefix}/ident/policy/${currentIndex}/arn`, policyOutput.policyArn);
        policies.push({
          name: policyOutput.policyName,
          index: currentIndex,
        });
      }
      updatedPolicies.push({
        index: currentIndex,
        name: policyOutput.policyName,
      });

      const removalIndex = removalObjects.findIndex(p => p.name === policyOutput.policyName);
      if (removalIndex !== -1) {
        removalObjects.splice(removalIndex, 1);
      }
    }

    const ssmPolicyLength = iamConfig.roles?.filter(
      r => r['ssm-log-archive-write-access'] || r['ssm-log-archive-access'],
    ).length;
    if (ssmPolicyLength && ssmPolicyLength !== 0) {
      const ssmPolicyOutput = IamPolicyOutputFinder.findOneByName({
        outputs,
        accountKey,
        policyKey: 'IamSsmWriteAccessPolicy',
      });
      if (!ssmPolicyOutput) {
        console.warn(`Didn't find IAM SSM Log Archive Write Access Policy in output`);
        continue;
      }
      let currentIndex: number;
      const previousPolicyIndexDetails = policies.findIndex(p => p.name === ssmPolicyOutput.policyName);
      if (previousPolicyIndexDetails >= 0) {
        currentIndex = policies[previousPolicyIndexDetails].index;
        console.log(`skipping creation of policy ${ssmPolicyOutput.policyName} in SSM`);
      } else {
        currentIndex = ++policyMaxIndex;
        await ssm.putParameter(
          `/${acceleratorPrefix}/ident/policy/${currentIndex}/name`,
          `${ssmPolicyOutput.policyName}`,
        );
        await ssm.putParameter(`/${acceleratorPrefix}/ident/policy/${currentIndex}/arn`, ssmPolicyOutput.policyArn);
        policies.push({
          name: ssmPolicyOutput.policyName,
          index: currentIndex,
        });
      }
      updatedPolicies.push({
        index: currentIndex,
        name: ssmPolicyOutput.policyName,
      });

      const removalIndex = removalObjects.findIndex(p => p.name === ssmPolicyOutput.policyName);
      if (removalIndex !== -1) {
        removalObjects.splice(removalIndex, 1);
      }
    }
  }

  for (const removeObject of removalObjects || []) {
    const removalPolicies = [
      `/${acceleratorPrefix}/ident/policy/${removeObject.index}/name`,
      `/${acceleratorPrefix}/ident/policy/${removeObject.index}/arn`,
    ].flatMap(s => s);

    while (removalPolicies.length > 0) {
      await ssm.deleteParameters(removalPolicies.splice(0, 10));
    }
  }
  return updatedPolicies;
}

export async function saveIamRoles(
  iamConfigs: IamConfig[],
  outputs: StackOutput[],
  ssm: SSM,
  accountKey: string,
  acceleratorPrefix: string,
  roles: OutputUtilGenericType[],
): Promise<OutputUtilGenericType[]> {
  const roleIndices = roles.flatMap(r => r.index) || [];
  console.log('roleIndices', roleIndices);
  let rolesMaxIndex = roleIndices.length === 0 ? 0 : Math.max(...roleIndices);
  const updatedRoles: OutputUtilGenericType[] = [];
  const removalObjects: OutputUtilGenericType[] = [...(roles || [])];

  for (const iamConfig of iamConfigs) {
    if (!iamConfig || !iamConfig.roles) {
      continue;
    }

    const roleIds = iamConfig.roles.flatMap(r => r.role);
    console.log('roleIds', roleIds);
    for (const role of roleIds) {
      const roleOutput = IamRoleNameOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        roleKey: 'IamAccountRole',
        roleName: role,
      });
      if (!roleOutput) {
        console.warn(`Didn't find IAM Role "${role}" in output`);
        continue;
      }

      let currentIndex: number;
      const previousRoleIndexDetails = roles.findIndex(p => p.name === roleOutput.roleName);
      if (previousRoleIndexDetails >= 0) {
        currentIndex = roles[previousRoleIndexDetails].index;
        console.log(`skipping creation of role ${roleOutput.roleName} in SSM`);
      } else {
        currentIndex = ++rolesMaxIndex;
        await ssm.putParameter(`/${acceleratorPrefix}/ident/role/${currentIndex}/name`, `${roleOutput.roleName}`);
        await ssm.putParameter(`/${acceleratorPrefix}/ident/role/${currentIndex}/arn`, roleOutput.roleArn);
        roles.push({
          name: roleOutput.roleName,
          index: currentIndex,
        });
      }
      updatedRoles.push({
        index: currentIndex,
        name: roleOutput.roleName,
      });

      const removalIndex = removalObjects.findIndex(p => p.name === roleOutput.roleName);
      if (removalIndex !== -1) {
        removalObjects.splice(removalIndex, 1);
      }
    }
  }

  for (const removeObject of removalObjects || []) {
    const removalRoles = [
      `/${acceleratorPrefix}/ident/role/${removeObject.index}/name`,
      `/${acceleratorPrefix}/ident/role/${removeObject.index}/arn`,
    ].flatMap(s => s);

    while (removalRoles.length > 0) {
      await ssm.deleteParameters(removalRoles.splice(0, 10));
    }
  }
  return updatedRoles;
}
