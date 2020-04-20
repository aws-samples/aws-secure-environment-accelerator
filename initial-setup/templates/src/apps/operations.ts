import * as cdk from '@aws-cdk/core';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { getStackOutput, loadStackOutputs } from '../utils/outputs';
import { Operations } from '../operations/stack';

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
  const subnetInfo = getStackOutput(outputs, "shared-network", "SubnetInfo");

  // TODO Get these values dynamically
  const operationsNetworkAccountId = getAccountId(accounts, 'operations');
  const operationsConfig = mandatoryAccountConfig['operations'];

  const app = new cdk.App();

  const stack = new Operations.Stack(app, 'Operations', {
    env: {
      account: operationsNetworkAccountId,
      region: cdk.Aws.REGION,
    },
    stackName: 'PBMMAccel-Operations',
    accountConfig: operationsConfig,
    subnetInfoOutput: subnetInfo
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', context.acceleratorName);

  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
}

// tslint:disable-next-line: no-floating-promises
main();
