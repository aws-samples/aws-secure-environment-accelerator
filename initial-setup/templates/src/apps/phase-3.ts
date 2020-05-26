import { PeeringConnection } from '../common/peering-connection';
import { GlobalOptionsDeployment } from '../common/global-options';
import { PhaseInput } from './shared';

export async function phase3({ acceleratorConfig, accountStacks, accounts, context, outputs }: PhaseInput) {
  /**
   * Code to create Peering Connection Routes in all accounts
   */
  const vpcConfigs = acceleratorConfig.getVpcConfigs();
  for (const { ouKey, accountKey, vpcConfig } of vpcConfigs) {
    const currentRouteTable = vpcConfig['route-tables']?.find(x => x.routes?.find(y => y.target === 'pcx'));
    if (!currentRouteTable) {
      continue;
    }
    const pcxRouteDeployment = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!pcxRouteDeployment) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

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

  const zonesStack = accountStacks.tryGetOrCreateAccountStack(zonesAccountKey);
  if (!zonesStack) {
    console.warn(`Cannot find account stack ${zonesAccountKey}`);
  } else {
    new GlobalOptionsDeployment(zonesStack, `GlobalOptionsDNSResolvers`, {
      accounts,
      outputs,
      context,
      acceleratorConfig,
    });
  }
}
