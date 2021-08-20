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

import { ConfigurationAccount, LoadConfigurationInput } from '../load-configuration-step';
import { CreateAccountOutput } from '@aws-accelerator/common/src/aws/types/account';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';

interface CreateOrganizationAccountInput extends LoadConfigurationInput {
  account: ConfigurationAccount;
}
const org = new Organizations();
export const handler = async (input: CreateOrganizationAccountInput): Promise<CreateAccountOutput> => {
  console.log(`Creating account using Organizations...`);
  console.log(JSON.stringify(input, null, 2));

  const { account, configRepositoryName, configFilePath, configCommitId } = input;

  if (account.accountId) {
    return {
      status: 'ALREADY_EXISTS',
      statusReason: `Skipping creation of account "${account.accountKey}" with ID "${account.accountId}"`,
    };
  }

  const { accountName, emailAddress } = account;

  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const roleName = config['global-options']['organization-admin-role']!;
  console.log(
    `Account Creation initiated for Email "${emailAddress}", Account Name "${accountName}, Role Name ${roleName}"`,
  );
  const accountResponse = await org.createAccount(emailAddress, accountName, roleName);
  const response = accountResponse;
  // TODO Handle more failure cases
  if (!response) {
    if (!account.isMandatoryAccount) {
      return {
        status: 'NON_MANDATORY_ACCOUNT_FAILURE',
        statusReason: `Skipping failure of non mandatory account creation "${account.accountKey}"`,
      };
    } else {
      return {
        status: 'ALREADY_EXISTS',
        statusReason: `failure of mandatory account creation "${account.accountKey}"`,
      };
    }
  }
  if (!account.isMandatoryAccount) {
    if (response.State === 'FAILURE') {
      console.log(response.FailureReason);
      return {
        status: 'NON_MANDATORY_ACCOUNT_FAILURE',
        statusReason: `Skipping failure of non mandatory account creation "${account.accountKey}"`,
      };
    }
  }
  return {
    status: response.State!,
    provisionToken: response.Id,
  };
};
