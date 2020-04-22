import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { GlobalOptionsDeployment } from '../common/global-options';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const app = new cdk.App();

  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccountKey = zonesConfig.account;

  const deployment = new AcceleratorStack(app, 'GlobalOptionsDNSResolversStack', {
    env: {
      account: getAccountId(accounts, zonesAccountKey),
      region: cdk.Aws.REGION,
    },
    stackName: `PBMMAccel-GlobalOptionsDNSResolvers`,
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
  });

  new GlobalOptionsDeployment(deployment, `GlobalOptionsDNSResolvers`, {
    accounts,
    outputs,
    context,
    acceleratorConfig,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
