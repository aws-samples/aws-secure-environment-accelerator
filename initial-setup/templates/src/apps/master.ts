import * as cdk from '@aws-cdk/core';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { Master } from '../master/stack';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { getStackOutput, loadStackOutputs } from '../utils/outputs';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];

  // TODO Get these values dynamically
  const masteAccountAccountId = getAccountId(accounts, 'master');
  const masteAccountConfig = mandatoryAccountConfig['master'];

  const app = new cdk.App();

  new Master.Stack(app, 'Master', {
    env: {
      account: masteAccountAccountId,
      region: cdk.Aws.REGION,
    },
    stackName: 'PBMMAccel-Master',
    accountConfig: masteAccountConfig,
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', context.acceleratorName);

  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
}

// tslint:disable-next-line: no-floating-promises
main();
