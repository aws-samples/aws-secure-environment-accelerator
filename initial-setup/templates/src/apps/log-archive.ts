import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadContext } from '../utils/context';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const accounts = await loadAccounts();

  const app = new cdk.App();

  const stack = new AcceleratorStack(app, 'LogArchive', {
    env: {
      account: getAccountId(accounts, 'log-archive'),
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-LogArchive',
  });

  const bucket = new s3.Bucket(stack, 'LogArchiveBucket');

  new cdk.CfnOutput(stack, 'LogBucketArn', {
    value: bucket.bucketArn,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
