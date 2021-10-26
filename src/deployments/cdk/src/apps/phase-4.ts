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

/**
 * This is the main entry point to deploy phase 4
 *
 * - SecurityHub Disable Controls
 * - Creates CloudWatch Metrics on LogGroups
 * - Associate Shared Resolver Rules to VPC
 * - Associate Hosted Zones to VPC
 */

export async function deploy({ acceleratorConfig, accounts, accountStacks, outputs, context }: PhaseInput) {
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

  /**
   * Associate Shared Rules to VPC
   */
  await centralEndpoints.step3({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    accounts,
  });

  /**
   * Associate Hosted Zones to VPC
   */
  await centralEndpoints.step4({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    accounts,
    executionRole: context.acceleratorPipelineRoleName,
    assumeRole: context.acceleratorExecutionRoleName,
  });
}
