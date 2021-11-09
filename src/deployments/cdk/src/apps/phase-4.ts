/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { PhaseInput } from './shared';
import * as securityHub from '../deployments/security-hub';
import * as cloudWatchDeployment from '../deployments/cloud-watch';
import * as centralEndpoints from '../deployments/central-endpoints';
import * as fmsDeployment from '../deployments/fms';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import * as firewallCluster from '../deployments/firewall/cluster';
import * as vpcDeployment from '../deployments/vpc';
import * as alb from '../deployments/alb';

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
  const { defaultRegion } = context;
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
    accounts,
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

  await fmsDeployment.putNotificationChannel({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    assumeRole: context.acceleratorExecutionRoleName,
    outputs,
  });

  await cloudWatchDeployment.step3({
    accountStacks,
    config: acceleratorConfig,
  });

  // Import all VPCs from all outputs
  const allVpcOutputs = VpcOutputFinder.findAll({ outputs });
  const allVpcs = allVpcOutputs.map(vpcDeployment.ImportedVpc.fromOutput);

  await firewallCluster.step4({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    vpcs: allVpcs,
    accounts,
    defaultRegion,
  });

  /**
   * Accept GatewalLoadBalancer Endpoint service endpoint requests
   */
  await alb.step3({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });
}
