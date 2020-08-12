import { PeeringConnection } from '../common/peering-connection';
import { GlobalOptionsDeployment } from '../common/global-options';
import { PhaseInput } from './shared';
import * as alb from '../deployments/alb';
import * as rsyslogDeployment from '../deployments/rsyslog';
import { ImportedVpc } from '../deployments/vpc';
import { VpcOutput } from '@aws-pbmm/common-outputs/lib/vpc';
import { getStackJsonOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { CentralBucketOutput, AccountBucketOutput } from '../deployments/defaults';
import * as securityHub from '../deployments/security-hub';
import * as macie from '../deployments/macie';

export async function deploy({ acceleratorConfig, accountStacks, accounts, context, outputs }: PhaseInput) {
  /**
   * Code to create Peering Connection Routes in all accounts
   */
  const vpcConfigs = acceleratorConfig.getVpcConfigs();
  for (const { ouKey, accountKey, vpcConfig } of vpcConfigs) {
    const currentRouteTable = vpcConfig['route-tables']?.find(x => x.routes?.find(y => y.target === 'pcx'));
    if (!currentRouteTable) {
      continue;
    }
    const pcxRouteDeployment = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
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

  // TODO Figure out how to keep the same logical IDs while supporting regions
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

  await alb.step1({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  // Import all VPCs from all outputs
  const allVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
    outputType: 'VpcOutput',
  });
  const allVpcs = allVpcOutputs.map(ImportedVpc.fromOutput);

  // Find the central bucket in the outputs
  const centralBucket = CentralBucketOutput.getBucket({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  await rsyslogDeployment.step2({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    vpcs: allVpcs,
    centralBucket,
  });

  // Deploy Security Hub Step-2
  await securityHub.step2({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });

  // Find the account buckets in the outputs
  const accountBuckets = AccountBucketOutput.getAccountBuckets({
    accounts,
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  await macie.step3({
    accountBuckets,
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });
}
