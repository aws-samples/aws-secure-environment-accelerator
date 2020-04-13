import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadContext } from '../utils/context';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const accounts = await loadAccounts();

  const app = new cdk.App();

  const stack = new cdk.Stack(app, 'LogArchive', {
    env: {
      account: getAccountId(accounts, 'log-archive'),
      region: cdk.Aws.REGION,
    },
    stackName: 'PBMMAccel-LogArchive',
  });

  const bucket = new s3.Bucket(stack, 'LogArchiveBucket');

  new cdk.CfnOutput(stack, 'LogBucketArn', {
    value: bucket.bucketArn,
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', context.acceleratorName);

  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
}

// tslint:disable-next-line: no-floating-promises
main();
