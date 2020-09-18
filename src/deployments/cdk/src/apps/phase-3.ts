import { PeeringConnection } from '../common/peering-connection';
import { PhaseInput } from './shared';
import * as alb from '../deployments/alb';
import * as centralEndpoints from '../deployments/central-endpoints';
import * as rsyslogDeployment from '../deployments/rsyslog';
import { ImportedVpc } from '../deployments/vpc';
import { VpcOutput } from '@aws-accelerator/common-outputs/src/vpc';
import { getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { CentralBucketOutput, AccountBucketOutput } from '../deployments/defaults';
import * as securityHub from '../deployments/security-hub';
import * as macie from '../deployments/macie';
import * as transitGateway from '../deployments/transit-gateway';


/**
 * This is the main entry point to deploy phase 3
 *
 * - create peering connection routes
 * - create ALB (step 1)
 * - create `rsyslog` deployment (step 2)
 * - create hosted zones, resolver rules and resolver endpoints and Share
 * - Enable Security Hub and Invite Sub accounts as members
 * - Macie update Session
 * - TransitGateway Peering attachment and routes
 */

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
   * CentralEndpoints.step1 creating public and private hosted zones in central account
   */
  await centralEndpoints.step1({
    acceleratorPrefix: context.acceleratorPrefix,
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  /**
   * CentralEndpoints.step2 creating resolver endpoints and rules for on-premise & mad
   * Share Central resolver rules to remote Accounts which has VPC in same region
   */
  await centralEndpoints.step2({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    accounts,
  });

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
    context,
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

  await transitGateway.step3({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });
}
