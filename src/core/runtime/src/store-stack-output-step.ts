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

import { STS } from '@aws-accelerator/common/src/aws/sts';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { CloudFormation } from '@aws-accelerator/common/src/aws/cloudformation';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { getUpdateValueInput } from './utils/dynamodb-requests';

export interface StoreStackOutputInput {
  acceleratorPrefix: string;
  assumeRoleName: string;
  account: Account;
  region: string;
  outputsTable: string;
  phaseNumber: number;
}

const sts = new STS();
const dynamodb = new DynamoDB();

export const handler = async (input: StoreStackOutputInput) => {
  console.log(`Storing stack output...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, assumeRoleName, account, region, outputsTable, phaseNumber } = input;
  const accountKey = account.key;
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const cfn = new CloudFormation(credentials, region);
  const stacks = cfn.listStacksGenerator({
    StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'],
  });

  const outputs: StackOutput[] = [];
  for await (const summary of stacks) {
    if (!summary.StackName.match(`${acceleratorPrefix}(.*)-Phase${phaseNumber}`)) {
      console.warn(`Skipping stack with name "${summary.StackName}"`);
      continue;
    }
    const stack = await cfn.describeStack(summary.StackName);
    if (!stack) {
      console.warn(`Could not load stack with name "${summary.StackName}"`);
      continue;
    }
    const acceleratorTag = stack.Tags?.find(t => t.Key === 'AcceleratorName');
    if (!acceleratorTag) {
      console.warn(`Could not find AcceleratorName tag in stack with name "${summary.StackName}"`);
      continue;
    }

    console.debug(`Storing outputs for stack with name "${summary.StackName}"`);
    stack.Outputs?.forEach(output =>
      outputs.push({
        accountKey,
        outputKey: `${output.OutputKey}`,
        outputValue: output.OutputValue,
        outputDescription: output.Description,
        outputExportName: output.ExportName,
        region,
      }),
    );
  }
  if (outputs.length === 0) {
    console.warn(`No outputs found for Account: ${accountKey} and Region: ${region}`);
    await dynamodb.deleteItem({
      TableName: outputsTable,
      Key: {
        id: { S: `${accountKey}-${region}-${phaseNumber}` },
      },
    });
    return {
      status: 'SUCCESS',
    };
  }

  const updateExpression = getUpdateValueInput([
    {
      key: 'a',
      name: 'accountKey',
      type: 'S',
      value: accountKey,
    },
    {
      key: 'r',
      name: 'region',
      type: 'S',
      value: region,
    },
    {
      key: 'p',
      name: 'phase',
      type: 'N',
      value: `${phaseNumber}`,
    },
    {
      key: 'v',
      name: 'outputValue',
      type: 'S',
      value: JSON.stringify(outputs),
    },
  ]);
  await dynamodb.updateItem({
    TableName: outputsTable,
    Key: {
      id: { S: `${accountKey}-${region}-${phaseNumber}` },
    },
    ...updateExpression,
  });
  return {
    status: 'SUCCESS',
  };
};
