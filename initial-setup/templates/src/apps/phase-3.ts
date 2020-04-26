import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import * as iam from '@aws-cdk/aws-iam';
import { pascalCase } from 'pascal-case';
import { loadStackOutputs } from '../utils/outputs';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import {
  PeeringConnectionConfig,
  VpcConfig,
  VpcConfigType,
  RouteTableConfig,
} from '@aws-pbmm/common-lambda/lib/config';
import { PeeringConnection } from '../common/peering-connection';
import { JsonOutputValue } from '../common/json-output';
import { GlobalOptionsDeployment } from '../common/global-options';
import { getAllAccountVPCConfigs, VpcConfigs } from '../common/get-all-vpcs';

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

  // Retrive all Account Configs
  const accountConfigs = getAllAccountVPCConfigs(acceleratorConfig);

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

  /**
   * Code to create Peering Connection in all accounts
   */
  for (const [account, accountConfig] of Object.entries(accountConfigs)) {
    const vpcConfig = accountConfig.vpc!;
    const accountKey = vpcConfig.deploy === 'local' ? account : vpcConfig.deploy;
    const currentRouteTable = vpcConfig['route-tables']?.find(x => x.routes?.find(y => y.target.startsWith('pcx-')));
    if (!currentRouteTable) {
      continue;
    }
    const routeTables = currentRouteTable?.routes?.find(x => x.target.startsWith('pcx-'));
    const pcxRouteDeployment = new AcceleratorStack(
      app,
      `PBMMAccel-PcxRouteDeployment${account}${vpcConfig.name}RoutesStack`,
      {
        env: {
          account: getAccountId(accounts, accountKey!),
          region: cdk.Aws.REGION,
        },
        stackName: `PBMMAccel-PcxRouteDeployment${account}${vpcConfig.name.replace('_', '')}RoutesStack`,
        acceleratorName: context.acceleratorName,
        acceleratorPrefix: context.acceleratorPrefix,
      },
    );

    const pcxRoute = new PeeringConnection.PeeringConnectionRoutes(pcxRouteDeployment, `PcxRoutes${vpcConfig.name!}`, {
      accountKey: accountKey!,
      vpcName: vpcConfig.name!,
      vpcConfigs: accountConfigs!,
      outputs,
    });
  }
}
// tslint:disable-next-line: no-floating-promises
main();
