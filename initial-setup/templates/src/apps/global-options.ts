import * as cdk from '@aws-cdk/core';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { GlobalOptions } from '../global-options/stack';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const globalOptionsConfig = acceleratorConfig['global-options'];

  // TODO Get these values dynamically
  const zonesConfig = globalOptionsConfig.zones;
  const [zoneAccount, resolverVpc, resolverSubnet] = [
    zonesConfig.account,
    zonesConfig['resolver-vpc'],
    zonesConfig['resolver-subnet'],
  ];
  const zonesCreationAccountId = getAccountId(accounts, zoneAccount);

  const app = new cdk.App();

  new GlobalOptions.Stack(app, 'GlobalOptions', {
    env: {
      account: zonesCreationAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-GlobalOptions',
    context,
    acceleratorConfig,
    outputs,
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', context.acceleratorName);

  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
}

// tslint:disable-next-line: no-floating-promises
main();
