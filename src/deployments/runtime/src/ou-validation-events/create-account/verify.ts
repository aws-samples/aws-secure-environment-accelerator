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

import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { CreateAccountStatus } from 'aws-sdk/clients/organizations';

interface VerifyAccountOrganizationInput {
  requestId: string;
}

const org = new Organizations();
export const handler = async (input: VerifyAccountOrganizationInput): Promise<CreateAccountStatus | undefined> => {
  console.log('Verifying Account Creation status ....');
  console.log(JSON.stringify(input, null, 2));
  const { requestId } = input;
  const accountStatus = await org.createAccountStatus(requestId);
  return accountStatus;
};
