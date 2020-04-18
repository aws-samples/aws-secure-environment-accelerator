import * as cdk from '@aws-cdk/core';
import { OrganizationalUnit } from '../organizational-units/stack';
import { LogArchive } from '../log-archive/stack';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();

  // TODO Get these values dynamically
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const centralLogRetention = globalOptionsConfig['central-log-retention'];
  const logArchiveAccountId = getAccountId(accounts, 'log-archive');
  const sharedNetworkAccountId = getAccountId(accounts, 'shared-network');

  const app = new cdk.App();

  const logArchiveStack = new LogArchive.Stack(app, 'LogArchive', {
    env: {
      account: logArchiveAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-LogArchive',
    centralLogRetentionInDays: centralLogRetention,
    sharedNetWorkAccountId: sharedNetworkAccountId,
  });

  // store the s3 bucket arn for later reference
  new cdk.CfnOutput(logArchiveStack, 's3BucketArn', {
    value: logArchiveStack.s3BucketArn,
  });

  // store the s3 bucket - kms key arn for later reference
  new cdk.CfnOutput(logArchiveStack, 's3KmsKeyArn', {
    value: logArchiveStack.s3KmsKeyArn,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
