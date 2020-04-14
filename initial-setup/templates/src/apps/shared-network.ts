import * as cdk from '@aws-cdk/core';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { OrganizationalUnit } from '../organizational-units/stack';
import { SharedNetwork } from '../shared-network/stack';
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

  // TODO Do something with the bucket ARN
  // const logBucketArn = getStackOutput(outputs, 'log-archive', 'LogBucketArn');

  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];

  // TODO Get these values dynamically
  const sharedNetworkAccountId = getAccountId(accounts, 'shared-network');
  const sharedNetworkConfig = mandatoryAccountConfig['shared-network'];

  const app = new cdk.App();

  new SharedNetwork.Stack(app, 'SharedNetwork', {
    env: {
      account: sharedNetworkAccountId,
      region: cdk.Aws.REGION,
    },
    stackName: 'PBMMAccel-SharedNetwork',
    accountConfig: sharedNetworkConfig,
  });

  const organizationalUnits = acceleratorConfig['organizational-units'];
  new OrganizationalUnit.Stack(app, 'OrganizationalUnits', {
    env: {
      account: sharedNetworkAccountId,
      region: cdk.Aws.REGION,
    },
    stackName: 'PBMMAccel-OrganizationalUnits',
    organizationalUnits,
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', context.acceleratorName);

  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
}

// tslint:disable-next-line: no-floating-promises
main();
