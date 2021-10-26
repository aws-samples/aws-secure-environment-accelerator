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

import { AccountVendingMachine } from '@aws-accelerator/common/src/aws/account-vending-machine';
import { ConfigurationAccount } from '../load-configuration-step';
import { AccountAvailableOutput } from '@aws-accelerator/common/src/aws/types/account';

interface CheckStepInput {
  account: ConfigurationAccount;
}

export const handler = async (input: Partial<CheckStepInput>): Promise<AccountAvailableOutput> => {
  console.log(`Verifying status of provisioned account`);
  console.log(JSON.stringify(input, null, 2));

  const { account } = input;

  const avm = new AccountVendingMachine();

  // Check the status of the provisioned account.

  let verifyAccountOutput: AccountAvailableOutput;
  if (account?.accountId) {
    verifyAccountOutput = await avm.isAccountAvailableByAccountId(account.accountId);
    if (verifyAccountOutput.status === 'FAILURE') {
      verifyAccountOutput = await avm.isAccountAvailable(account.accountKey);
    }
  } else {
    verifyAccountOutput = await avm.isAccountAvailable(account?.accountKey!);
  }

  if (account && !account.isMandatoryAccount) {
    const status = verifyAccountOutput.status;
    if (status && status === 'FAILURE') {
      return {
        status: 'FAILURE',
        statusReason: `Account creation in Control Tower failed for "${account.accountKey}"`,
      };
    }
  }
  return verifyAccountOutput;
};
