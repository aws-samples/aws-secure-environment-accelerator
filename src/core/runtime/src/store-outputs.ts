import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { CloudFormation } from '@aws-accelerator/common/src/aws/cloudformation';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { v4 as uuidv4 } from 'uuid';

export interface StoreStackOutputInput {
  acceleratorPrefix: string;
  assumeRoleName: string;
  account: Account;
  region: string;
  outputsTable: string;
}

const sts = new STS();
const dynamodb = new DynamoDB();

export const handler = async (input: StoreStackOutputInput) => {
  console.log(`Storing stack output...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, assumeRoleName, account, region, outputsTable } = input;
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const cfn = new CloudFormation(credentials, region);
  const stacks = cfn.listStacksGenerator({
    StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE'],
  });
  const outputs: StackOutput[] = [];
  for await (const summary of stacks) {
    if (!summary.StackName.startsWith(acceleratorPrefix)) {
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
    // dynamodb.batchWriteItem({
    //   RequestItems: {

    //   }
    // })
    stack.Outputs?.forEach(output =>
      outputs.push({
        accountKey: account.key,
        outputKey: output.OutputKey,
        outputValue: output.OutputValue,
        outputDescription: output.Description,
        outputExportName: output.ExportName,
        region,
      }),
    );
  }
  return {
    status: 'SUCCESS',
  };
};

const exportOutPutAsDynamoInput = (output: StackOutput) => {
  const putRequest = {
    Item: {
      id: { S: uuidv4() },
      accountKey: { S: output.accountKey },
      region: { S: output.region },
      // outputValue: { ''}
    },
  };
};

handler({
  outputsTable: 'PBMMAccel-Outputs',
  acceleratorPrefix: 'PBMMAccel-',
  assumeRoleName: 'PBMMAccel-PipelineRole',
  account: {
    key: 'master',
    id: '003837753302',
    arn: 'arn:aws:organizations::003837753302:account/o-8rceswjlsq/003837753302',
    name: 'NonALZ6',
    email: 'nkoppula+non-alz-7-master@amazon.com',
    ou: 'core',
    ouPath: 'core',
  },
  region: 'ca-central-1',
});
