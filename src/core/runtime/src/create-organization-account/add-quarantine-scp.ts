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
import { CreateAccountOutput } from '@aws-accelerator/common/src/aws/types/account';
import { ServiceControlPolicy } from '@aws-accelerator/common/src/scp';

interface AddQuarantineScpInput {
  account: ConfigurationAccount;
  acceleratorPrefix: string;
  acceleratorName: string;
  region: string;
  organizationAdminRole: string;
}

export const handler = async (input: AddQuarantineScpInput): Promise<CreateAccountOutput> => {
  console.log(`Adding quarantine SCP to account...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, account, organizationAdminRole, acceleratorName, region } = input;

  if (!account.accountId) {
    return {
      status: 'FAILED',
      statusReason: `Skipping adding SCP of account "${account.accountKey}"`,
    };
  }

  const scps = new ServiceControlPolicy({
    acceleratorPrefix,
    acceleratorName,
    region,
    organizationAdminRole,
  });
  await scps.createOrUpdateQuarantineScp([account.accountId]);

  return {
    status: 'SUCCESS',
    provisionToken: `Account "${account.accountId}" successfully attached to Quarantine SCP`,
  };
};
