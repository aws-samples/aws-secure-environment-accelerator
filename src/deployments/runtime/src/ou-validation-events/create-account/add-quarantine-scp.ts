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

import { CreateAccountOutput } from '@aws-accelerator/common/src/aws/types/account';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { ServiceControlPolicy } from '@aws-accelerator/common/src/scp';

interface AddQuarantineScpInput {
  accountId: string;
  acceleratorPrefix: string;
  acceleratorName: string;
  region: string;
  organizationAdminRole: string;
}

const organizations = new Organizations();

export const handler = async (input: AddQuarantineScpInput): Promise<CreateAccountOutput> => {
  console.log(`Adding quarantine SCP to account...`);
  console.log(JSON.stringify(input, null, 2));

  const { accountId, acceleratorPrefix, organizationAdminRole, acceleratorName, region } = input;

  await addQuarantineScp(acceleratorPrefix, acceleratorName, region, organizationAdminRole, accountId);
  return {
    status: 'SUCCESS',
    provisionToken: `Account "${accountId}" successfully attached to Quarantine SCP`,
  };
};

async function addQuarantineScp(
  acceleratorPrefix: string,
  acceleratorName: string,
  region: string,
  organizationAdminRole: string,
  accountId: string,
) {
  const scps = new ServiceControlPolicy({
    client: organizations,
    acceleratorPrefix,
    acceleratorName,
    region,
    organizationAdminRole,
  });
  const policyId = await scps.createOrUpdateQuarantineScp();

  console.log(`Attaching SCP "QNO SCP" to account "${accountId}"`);
  try {
    await organizations.attachPolicy(policyId, accountId);
  } catch (e) {
    console.warn(`Exception while attachPolicy`);
    if (e.errorType === 'DuplicatePolicyAttachmentException') {
      return;
    }
    const errorMessage = `${e}`;
    if (errorMessage.includes('DuplicatePolicyAttachmentException')) {
      return;
    }
    throw new Error(e);
  }
}
