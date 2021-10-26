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

interface BootstrapDetailsInput {
  accounts: string[];
  operationsAccountId: string;
}

interface BootstrapOutput {
  region: string;
  bucketName: string;
  bucketDomain: string;
}

export const handler = async (input: BootstrapDetailsInput) => {
  console.log(`Get Bootstrap Accounts...`);
  console.log(JSON.stringify(input, null, 2));
  const outputs: BootstrapOutput[] = [];
  const { accounts, operationsAccountId } = input;
  const opsIndex = accounts.indexOf(operationsAccountId);
  if (opsIndex !== -1) {
    accounts.splice(opsIndex, 1);
  }
  console.log(JSON.stringify(outputs, null, 2));
  return accounts;
};
