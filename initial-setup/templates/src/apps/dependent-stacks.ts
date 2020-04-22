import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { DependentResources } from '../common/dependent-resources-stack';
import { GlobalOptionsDeployment } from '../common/global-options';

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

  const deployment = new DependentResources(app, 'GlobalOptionsDNSResolversStack', {
    env: {
      account: getAccountId(accounts, zonesConfig.account),
      region: cdk.Aws.REGION,
    },
    stackName: `PBMMAccel-GlobalOptionsDNSResolvers`,
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
  });

  const globalOptionsStack = new GlobalOptionsDeployment(deployment, `GlobalOptionsDNSResolvers`, {
    accounts,
    outputs,
    context,
    acceleratorConfig,
  });
  for (const [key, value] of globalOptionsStack.outputs) {
    new cdk.CfnOutput(deployment, key, {
      value,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();
