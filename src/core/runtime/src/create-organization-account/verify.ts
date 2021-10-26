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

import { ConfigurationAccount } from '../load-configuration-step';
import { AccountAvailableOutput } from '@aws-accelerator/common/src/aws/types/account';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';

const ACCOUNT_ALREADY_EXISTS = ['EMAIL_ALREADY_EXISTS', 'GOVCLOUD_ACCOUNT_ALREADY_EXISTS'];

interface CheckStepInput {
  account: ConfigurationAccount;
  requestId: string;
}

interface CheckStepOutput extends AccountAvailableOutput {
  account?: ConfigurationAccount;
}
const org = new Organizations();

export const handler = async (input: Partial<CheckStepInput>): Promise<CheckStepOutput> => {
  console.log(`Verifying status of provisioned account`);
  console.log(JSON.stringify(input, null, 2));
  const { account, requestId } = input;
  const accountStatus = await org.createAccountStatus(requestId!);
  const response = accountStatus;
  if (!response) {
    if (account && !account.isMandatoryAccount) {
      return {
        status: 'NON_MANDATORY_ACCOUNT_FAILURE',
        statusReason: `Skipping failure of non mandatory account creation "${account.accountKey}"`,
      };
    } else {
      return {
        status: 'FAILURE',
        statusReason: `failure of mandatory account creation "${account?.accountKey}"`,
      };
    }
  }
  if (response.State === 'FAILED' && ACCOUNT_ALREADY_EXISTS.includes(response.FailureReason!)) {
    return {
      status: 'ALREADY_EXISTS',
      statusReason: response.FailureReason,
    };
  }
  if (account) {
    account.accountId = response.AccountId;
  }
  return {
    status: response.State,
    statusReason: response.FailureReason || 'Account Created Successfully.',
    account,
  };
};
