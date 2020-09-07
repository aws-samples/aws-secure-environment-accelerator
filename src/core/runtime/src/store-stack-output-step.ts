import { ShortAccount } from '@aws-accelerator/common-outputs/src/accounts';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { CloudFormation } from '@aws-accelerator/common/src/aws/cloudformation';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export interface StoreStackOutputInput {
  acceleratorPrefix: string;
  assumeRoleName: string;
  account: ShortAccount;
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
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const cfn = new CloudFormation(credentials, region);
  const stacks = cfn.listStacksGenerator({
    StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE'],
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
    const acceleratorTag = stack.Tags?.find(t => t.Key === 'Accelerator');
    if (!acceleratorTag) {
      console.warn(`Could not find Accelerator tag in stack with name "${summary.StackName}"`);
      continue;
    }

    console.debug(`Storing outputs for stack with name "${summary.StackName}"`);
    stack.Outputs?.forEach(output =>
      outputs.push({
        accountKey: account.key,
        outputKey: `${output.OutputKey}sjkdh`,
        outputValue: output.OutputValue,
        outputDescription: output.Description,
        outputExportName: output.ExportName,
        region,
      }),
    );
  }
  if (outputs.length === 0) {
    console.warn(`No outputs found for Account: ${account.key} and Region: ${region}`);
    await dynamodb.deleteItem({
      TableName: outputsTable,
      Key: {
        id: { S: `${account.key}-${region}-${phaseNumber}` },
      },
    });
    return {
      status: 'SUCCESS',
    };
  }
  await dynamodb.putItem({
    Item: {
      id: { S: `${account.key}-${region}-${phaseNumber}` },
      accountKey: { S: account.key },
      region: { S: region },
      phase: { N: `${phaseNumber}` },
      outputValue: { S: JSON.stringify(outputs) },
    },
    TableName: outputsTable,
  });
  return {
    status: 'SUCCESS',
  };
};
