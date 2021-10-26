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
import { CreateAccountOutput } from '@aws-accelerator/common/src/aws/types/account';

interface CreateMasterExecutionRoleInput {
  avmPortfolioName: string;
  avmProductName: string;
  account: ConfigurationAccount;
}

export const handler = async (input: CreateMasterExecutionRoleInput): Promise<CreateAccountOutput> => {
  console.log(`Creating account using AVM...`);
  console.log(JSON.stringify(input, null, 2));

  const { avmPortfolioName, avmProductName, account } = input;

  if (account.landingZoneAccountType) {
    return {
      status: 'NOT_RELEVANT',
      statusReason: `Skipping creation of Landing Zone account "${account.landingZoneAccountType}"`,
    };
  }

  const avm = new AccountVendingMachine();

  if (account.accountId) {
    // check current control tower provisioning status
    const controlTowerAccountStatus = await avm.getAccountStatus(account.accountName);
    if (controlTowerAccountStatus.status !== 'NOT_EXISTS') {
      return controlTowerAccountStatus;
    }
  }

  // create account using account-vending-machine
  const createAccountOutput = await avm.createAccount({
    avmPortfolioName,
    avmProductName,
    ...account,
  });

  if (!account.isMandatoryAccount) {
    const status = createAccountOutput.status;
    if (status && status === 'FAILURE') {
      return {
        status: 'FAILED',
        statusReason: `Failure of account creation in Control Tower "${account.accountKey}"`,
      };
    }
  }
  return createAccountOutput;
};
