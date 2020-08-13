import * as aws from 'aws-sdk';
import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { CloudFormation } from '@aws-accelerator/common/src/aws/cloudformation';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { collectAsync } from '@aws-accelerator/common/src/util/generator';
import { CentralBucketOutputFinder } from '@aws-accelerator/common-outputs/src/central-bucket';
import { S3 } from '@aws-accelerator/common/src/aws/s3';

export interface StoreStackOutputInput {
  acceleratorPrefix: string;
  assumeRoleName: string;
  accounts: Account[];
  regions: string[];
}

const s3 = new S3();
const sts = new STS();

export const handler = async (input: StoreStackOutputInput) => {
  console.log(`Storing stack output...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, assumeRoleName, accounts, regions } = input;

  const outputsAsyncIterable = getOutputsForAccountsAndRegions({
    acceleratorPrefix,
    accounts,
    assumeRoleName,
    regions,
  });
  const outputs = await collectAsync(outputsAsyncIterable);

  // Find the central output bucket in outputs
  const centralBucketOutput = CentralBucketOutputFinder.tryFindOne({
    outputs,
  });

  if (!centralBucketOutput) {
    console.log(`Didn't find "centralBucket" in existing outputs, might be first run of Accelerator`);
    return {
      status: 'SUCCESS',
      outputBucketName: '',
      outputBucketKey: '',
      outputVersion: '',
    };
  }

  console.log(`Writing outputs to s3://${centralBucketOutput.bucketName}/outputs.json`);

  // Store outputs on S3
  const response = await s3.putObject({
    Bucket: centralBucketOutput.bucketName,
    Key: 'outputs.json',
    Body: JSON.stringify(outputs),
  });

  return {
    status: 'SUCCESS',
    outputBucketName: centralBucketOutput.bucketName,
    outputBucketKey: 'outputs.json',
    outputVersion: response.VersionId,
  };
};

/**
 * Find all outputs in the given accounts and regions.
 */
async function* getOutputsForAccountsAndRegions(props: {
  acceleratorPrefix: string;
  accounts: Account[];
  assumeRoleName: string;
  regions: string[];
}): AsyncIterableIterator<StackOutput> {
  const { acceleratorPrefix, accounts, assumeRoleName, regions } = props;
  const outputsListPromises = [];
  for (const account of accounts) {
    const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
    for (const region of regions) {
      const outputsListPromise = getOutputsForRegion({
        acceleratorPrefix,
        accountKey: account.key,
        credentials,
        region,
      });
      outputsListPromises.push(outputsListPromise);
    }
  }
  for (const outputsList of outputsListPromises) {
    yield* outputsList;
  }
}

/**
 * Find all outputs in the given account and region.
 */
async function* getOutputsForRegion(props: {
  acceleratorPrefix: string;
  accountKey: string;
  credentials: aws.Credentials;
  region: string;
}): AsyncIterableIterator<StackOutput> {
  const { acceleratorPrefix, accountKey, credentials, region } = props;

  try {
    const cfn = new CloudFormation(credentials, region);

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
        console.warn(`Could not find Accelerator tag in stack with name "${summary.StackName}" in region ${region}`);
        continue;
      }

      console.debug(`Storing outputs for stack with name "${summary.StackName}" in region ${region}`);
      for (const output of stack.Outputs || []) {
        yield {
          accountKey,
          region,
          outputKey: output.OutputKey,
          outputValue: output.OutputValue,
          outputDescription: output.Description,
          outputExportName: output.ExportName,
        };
      }
    }
  } catch (e) {
    console.warn(`Cannot find outputs in account "${accountKey}" and region "${region}": ${e}`);
  }
}
