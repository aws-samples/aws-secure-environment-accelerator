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

import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { ServiceControlPolicy } from '@aws-accelerator/common/src/scp';
import { loadAccounts } from './utils/load-accounts';

interface DetachQuarantineScpInput {
  acceleratorPrefix: string;
  parametersTableName: string;
}

const organizations = new Organizations();
const dynamodb = new DynamoDB();
export const handler = async (input: DetachQuarantineScpInput): Promise<string> => {
  console.log(`Creating account using Organizations...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, parametersTableName } = input;
  const accounts = await loadAccounts(parametersTableName, dynamodb);

  const policyName = ServiceControlPolicy.createQuarantineScpName({ acceleratorPrefix });

  // Find all policies in the organization
  const policy = await organizations.getPolicyByName({
    Filter: 'SERVICE_CONTROL_POLICY',
    Name: policyName,
  });
  const policyId = policy?.PolicySummary?.Id;
  if (!policyId) {
    console.log(`No SCP with name ${policyName} to detach from accounts`);
    return 'SUCCESS';
  }
  for (const account of accounts) {
    console.log(`Detaching policy "${policyName}" from account "${account.name}"`);
    try {
      await organizations.detachPolicy(policyId, account.id);
    } catch (e) {
      if (e.code === 'PolicyNotAttachedException') {
        console.log(`"${policyName}" is not attached to account "${account.name}"`);
        continue;
      }
      throw e;
    }
  }
  return 'SUCCESS';
};
