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

import { SNS } from '@aws-accelerator/common/src/aws/sns';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { loadAccounts } from './utils/load-accounts';

const MAX_SNS_PUBLISH_CHAR = 255500;
const AVG_CHARS_PER_ACCOUNT = 100;

interface NotifySuccessInput {
  notificationTopicArn: string;
  parametersTableName: string;
  acceleratorVersion?: string;
}

const sns = new SNS();
const dynamodb = new DynamoDB();

export const handler = async (input: NotifySuccessInput): Promise<string> => {
  console.log('State Machine Execution Success...');
  console.log(JSON.stringify(input, null, 2));
  const { acceleratorVersion, parametersTableName } = input;
  const accounts = (await loadAccounts(parametersTableName, dynamodb)).filter(acc => acc.inScope);
  const responseAccounts = accounts.map(acc => ({
    key: acc.key,
    id: acc.id,
    ouPath: acc.ouPath,
    name: acc.name,
  }));
  const defaultReturnArguments = {
    acceleratorVersion,
    Status: 'SUCCESS',
  };
  let successReturn = {
    // Adding defaultArguments in return with appropriate order
    ...defaultReturnArguments,
    allAccounts: 'Yes',
    accounts: responseAccounts,
  };
  let successReturnStr = JSON.stringify(successReturn);
  while (successReturnStr.length > MAX_SNS_PUBLISH_CHAR) {
    const avgRemoveAccounts = Math.ceil((successReturnStr.length - MAX_SNS_PUBLISH_CHAR) / AVG_CHARS_PER_ACCOUNT);
    successReturn = {
      // Adding defaultArguments in return with appropriate order
      ...defaultReturnArguments,
      allAccounts: 'No',
      accounts: successReturn.accounts.slice(0, successReturn.accounts.length - avgRemoveAccounts),
    };
    successReturnStr = JSON.stringify(successReturn);
  }
  await sns.publish({
    Message: successReturnStr,
    TopicArn: input.notificationTopicArn,
    Subject: 'Accelerator State Machine Execution Success',
  });
  return 'SUCCESS';
};
