import * as cdk from '@aws-cdk/core';
import { Perimeter } from '../perimeter/stack';
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

  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];

  // TODO Get these values dynamically
  const perimeterAccountId = getAccountId(accounts, 'perimeter');
  const perimeterConfig = mandatoryAccountConfig.perimeter;

  const app = new cdk.App();

  new Perimeter.Stack(app, 'Perimeter', {
    env: {
      account: perimeterAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-Perimeter',
    accountConfig: perimeterConfig,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
