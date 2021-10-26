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

import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getOutput, SaveOutputsInput, saveIndexOutput, OutputUtilGenericType, getIamSsmOutput } from './utils';
import { IamConfig } from '@aws-accelerator/common-config';
import {
  prepareMandatoryAccountIamConfigs,
  prepareOuAccountIamConfigs,
  saveIamRoles,
  saveIamPolicy,
  saveIamUsers,
  saveIamGroups,
} from './iam-utils';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';

interface IamOutput {
  roles: OutputUtilGenericType[];
  policies: OutputUtilGenericType[];
  users: OutputUtilGenericType[];
  groups: OutputUtilGenericType[];
}

/**
 * Outputs for IAM related deployments will be found in following phases
 * Phase 1
 */

/**
 *
 * @param outputsTableName
 * @param client
 * @param config
 * @param account
 *
 * @returns void
 */
export async function saveIamOutputs(props: SaveOutputsInput) {
  const {
    acceleratorPrefix,
    account,
    config,
    dynamodb,
    outputsTableName,
    assumeRoleName,
    region,
    outputUtilsTableName,
  } = props;

  const accountConfig = config.getMandatoryAccountConfigs().find(([accountKey, _]) => accountKey === account.key);
  const accountsIam: { [accountKey: string]: IamConfig[] } = {};

  // finding iam for account iam configs
  await prepareMandatoryAccountIamConfigs(accountsIam, accountConfig);

  // finding iam for ou iam configs
  await prepareOuAccountIamConfigs(config, account, accountsIam);
  // console.log('Accounts Iam', Object.keys(accountsIam));

  // if no IAM Config found for the account, return
  if (Object.keys(accountsIam).length === 0) {
    return;
  }

  const smRegion = config['global-options']['aws-org-management'].region;
  const outputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${smRegion}-1`, dynamodb);
  const ssmOutputs = await getIamSsmOutput(outputUtilsTableName, `${account.key}-${region}-identity`, dynamodb);
  // console.log('ssmOutputs', ssmOutputs);

  const roles: OutputUtilGenericType[] = [];
  const policies: OutputUtilGenericType[] = [];
  const users: OutputUtilGenericType[] = [];
  const groups: OutputUtilGenericType[] = [];

  if (ssmOutputs) {
    const ssmIamOutput: IamOutput = JSON.parse(ssmOutputs);
    roles.push(...ssmIamOutput.roles);
    policies.push(...ssmIamOutput.policies);
    users.push(...ssmIamOutput.users);
    groups.push(...ssmIamOutput.groups);
  }

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const ssm = new SSM(credentials, region);

  const updatedRoles = await saveIamRoles(
    Object.values(accountsIam)[0],
    outputs,
    ssm,
    account.key,
    acceleratorPrefix,
    roles,
  );
  const updatedPolicies = await saveIamPolicy(
    Object.values(accountsIam)[0],
    outputs,
    ssm,
    account.key,
    acceleratorPrefix,
    policies,
  );
  const updatedUsers = await saveIamUsers(
    Object.values(accountsIam)[0],
    outputs,
    ssm,
    account.key,
    acceleratorPrefix,
    users,
  );
  const updatedGroups = await saveIamGroups(
    Object.values(accountsIam)[0],
    outputs,
    ssm,
    account.key,
    acceleratorPrefix,
    groups,
  );

  const iamOutput: IamOutput = {
    roles: updatedRoles,
    policies: updatedPolicies,
    users: updatedUsers,
    groups: updatedGroups,
  };
  const iamIndexOutput = JSON.stringify(iamOutput);
  console.log('indexOutput', iamIndexOutput);
  await saveIndexOutput(outputUtilsTableName, `${account.key}-${region}-identity`, iamIndexOutput, dynamodb);
}
