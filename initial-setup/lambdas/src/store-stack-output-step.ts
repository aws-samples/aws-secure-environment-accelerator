import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { CloudFormation } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { CentralBucketOutputFinder } from '@aws-pbmm/common-outputs/lib/central-bucket';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';

export interface StoreStackOutputInput {
  acceleratorPrefix: string;
  assumeRoleName: string;
  accounts: Account[];
}

const s3 = new S3();
const sts = new STS();

export const handler = async (input: StoreStackOutputInput) => {
  console.log(`Storing stack output...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, assumeRoleName, accounts } = input;

  const outputs: StackOutput[] = [];
  for (const account of accounts) {
    const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);

    const cfn = new CloudFormation(credentials);
    const stacks = cfn.listStacksGenerator({
      StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE'],
    });
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
      stack.Outputs?.forEach(output =>
        outputs.push({
          accountKey: account.key,
          outputKey: output.OutputKey,
          outputValue: output.OutputValue,
          outputDescription: output.Description,
          outputExportName: output.ExportName,
        }),
      );
    }
  }

  // Find the central output bucket in outputs
  const centralBucketOutput = CentralBucketOutputFinder.findOne({
    outputs,
  });

  console.log(`Writing outputs to s3://${centralBucketOutput.bucketName}/outputs.json`);

  // Store outputs on S3
  await s3.putObject({
    Bucket: centralBucketOutput.bucketName,
    Key: 'outputs.json',
    Body: JSON.stringify(outputs),
  });

  return {
    status: 'SUCCESS',
    outputsBucketName: centralBucketOutput.bucketName,
    outputsBucketKey: 'outputs.json',
  };
};
