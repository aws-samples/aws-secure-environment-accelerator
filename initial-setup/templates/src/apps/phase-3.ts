import * as cdk from '@aws-cdk/core';
import { loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { PeeringConnection } from '../common/peering-connection';
import { GlobalOptionsDeployment } from '../common/global-options';
import { AccountStacks } from '../common/account-stacks';
import * as firewallCluster from '../deployments/firewall/cluster';
import * as firewallManagement from '../deployments/firewall/manager';
import { CentralBucketOutput, AccountBucketOutput } from '../deployments/defaults';
import { VpcOutput, ImportedVpc } from '../deployments/vpc';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

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

  const accountStacks = new AccountStacks(app, {
    phase: 3,
    accounts,
    context,
  });

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

  // TODO Find a better way to get VPCs
  // Import all VPCs from all outputs
  const allVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
    outputType: 'VpcOutput',
  });
  const allVpcs = allVpcOutputs.map((o, index) => ImportedVpc.fromOutput(app, `Vpc${index}`, o));

  // Find the account buckets in the outputs
  const accountBuckets = AccountBucketOutput.getAccountBuckets({
    acceleratorPrefix: context.acceleratorPrefix,
    accounts,
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  // Find the central bucket in the outputs
  const centralBucket = CentralBucketOutput.getBucket({
    acceleratorPrefix: context.acceleratorPrefix,
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  await firewallCluster.step4({
    accountBuckets,
    accountStacks,
    centralBucket,
    config: acceleratorConfig,
    outputs,
    vpcs: allVpcs,
  });
  
  await firewallManagement.step1({
    accountStacks,
    config: acceleratorConfig,
    vpcs: allVpcs,
    outputs
  });
}

// tslint:disable-next-line: no-floating-promises
main();
