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

import * as aws from 'aws-sdk';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { loadAccounts } from './utils/load-accounts';

interface AddRoleToKmsKeyInput {
  roleName: string;
  kmsKeyId: string;
  parametersTableName: string;
}

const dynamodb = new DynamoDB();
const kms = new aws.KMS();

export const handler = async (input: AddRoleToKmsKeyInput) => {
  console.log(`Adding roles to KMS key policy...`);
  console.log(JSON.stringify(input, null, 2));

  const { roleName, kmsKeyId, parametersTableName } = input;

  const accounts = await loadAccounts(parametersTableName, dynamodb);

  const getKeyPolicy = await kms
    .getKeyPolicy({
      KeyId: kmsKeyId,
      PolicyName: 'default',
    })
    .promise();

  const policy = getKeyPolicy?.Policy;
  if (!policy) {
    console.warn(`Cannot find default KMS key policy for key "${kmsKeyId}"`);
    return;
  }

  // Parse the policy and find the statement
  const content = JSON.parse(policy);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const statements: any[] = content.Statement;
  if (!statements) {
    console.warn(`The default KMS key policy for key "${kmsKeyId}" does not have a Statement field`);
    return;
  }

  // Add our role to all the statements
  const roles = accounts.map(a => `arn:aws:iam::${a.id}:role/${roleName}`);

  // Allow sub accounts to decrypt, encrypt, ...
  const subaccountStatement = {
    Sid: 'Subaccounts',
    Effect: 'Allow',
    Principal: {
      AWS: roles,
    },
    Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'],
    Resource: '*',
  };

  const existingSubaccountStatement = statements.find(s => s.Sid === subaccountStatement.Sid);
  if (existingSubaccountStatement) {
    // If the statement exists we override it
    Object.assign(existingSubaccountStatement, subaccountStatement);
  } else {
    // If the statement does not exist we add it
    statements.push(subaccountStatement);
  }

  console.log(`Updating the KMS key policy for key "${kmsKeyId}"`);
  console.log(JSON.stringify(content, null, 2));

  await kms
    .putKeyPolicy({
      KeyId: kmsKeyId,
      PolicyName: 'default',
      Policy: JSON.stringify(content),
    })
    .promise();

  return {
    status: 'SUCCESS',
    statusReason: `Updated the KMS key policy with name ${kmsKeyId}`,
  };
};
