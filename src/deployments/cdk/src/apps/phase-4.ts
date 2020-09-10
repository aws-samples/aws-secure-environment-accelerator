import { PhaseInput } from './shared';
import * as securityHub from '../deployments/security-hub';
import * as cloudWatchDeployment from '../deployments/cloud-watch';
import * as centralEndpoints from '../deployments/central-endpoints';

export interface RdgwArtifactsOutput {
  accountKey: string;
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

export async function deploy({ acceleratorConfig, accounts, accountStacks, outputs }: PhaseInput) {
  /**
   * CentralEndpoints.step3 Share Central resolver rules to remove VPCs
   */
  await centralEndpoints.step3({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    accounts,
  });

  // Deploy Security Hub Step-3 to disable specific controls
  await securityHub.step3({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });

  /**
   *  CloudWatch Deployment step-1
   *  Creates CloudWatch Metrics on LogGroups
   */
  await cloudWatchDeployment.step1({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });
}
