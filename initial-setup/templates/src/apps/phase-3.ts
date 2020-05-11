import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { PeeringConnection } from '../common/peering-connection';
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

  /**
   * Code to create Peering Connection Routes in all accounts
   */
  const vpcConfigs = acceleratorConfig.getVpcConfigs();
  for (const { ouKey, accountKey, vpcConfig } of vpcConfigs) {
    const currentRouteTable = vpcConfig['route-tables']?.find(x => x.routes?.find(y => y.target === 'pcx'));
    if (!currentRouteTable) {
      continue;
    }
    const pcxRouteDeployment = new AcceleratorStack(
      app,
      `PBMMAccel-PcxRouteDeployment${accountKey}${vpcConfig.name}RoutesStack`,
      {
        env: {
          account: getAccountId(accounts, accountKey),
          region: cdk.Aws.REGION,
        },
        stackName: `PBMMAccel-PcxRouteDeployment${accountKey}${vpcConfig.name.replace('_', '')}RoutesStack`,
        acceleratorName: context.acceleratorName,
        acceleratorPrefix: context.acceleratorPrefix,
      },
    );

    new PeeringConnection.PeeringConnectionRoutes(pcxRouteDeployment, `PcxRoutes${vpcConfig.name}`, {
      accountKey,
      vpcName: vpcConfig.name,
      vpcConfigs,
      outputs,
    });
  }

  /**
   * Code to create DNS Resolvers
   */
  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccountKey = zonesConfig.account;

  const deployment = new AcceleratorStack(app, 'PBMMAccel-A-GlobalOptionsDNSResolversStack', {
    env: {
      account: getAccountId(accounts, zonesAccountKey),
      region: cdk.Aws.REGION,
    },
    stackName: `PBMMAccel-A-GlobalOptionsDNSResolvers`,
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
