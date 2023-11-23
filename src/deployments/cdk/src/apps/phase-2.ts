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

import { pascalCase } from 'pascal-case';
import * as cdk from 'aws-cdk-lib';
import { getAccountId } from '../utils/accounts';
import { JsonOutputValue } from '../common/json-output';
import { getVpcConfig } from '../common/get-all-vpcs';
import { VpcOutputFinder, SharedSecurityGroupIndexOutput, NfwOutput } from '@aws-accelerator/common-outputs/src/vpc';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { PeeringConnectionConfig, VpcConfigType } from '@aws-accelerator/common-config/src';
import { getVpcSharedAccountKeys } from '../common/vpc-subnet-sharing';
import { SecurityGroup } from '../common/security-group';
import { AddTagsToResourcesOutput } from '../common/add-tags-to-resources-output';
import * as firewallManagement from '../deployments/firewall/manager';
import * as firewallCluster from '../deployments/firewall/cluster';
import * as securityHub from '../deployments/security-hub';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CentralBucketOutput, AccountBucketOutput, AesBucketOutput } from '../deployments/defaults';
import { PcxOutput, PcxOutputType } from '../deployments/vpc-peering/outputs';
import { StructuredOutput } from '../common/structured-output';
import { PhaseInput } from './shared';
import * as madDeployment from '../deployments/mad';
import * as vpcDeployment from '../deployments/vpc';
import * as createTrail from '../deployments/cloud-trail';
import * as tgwDeployment from '../deployments/transit-gateway';
import * as macie from '../deployments/macie';
import * as centralServices from '../deployments/central-services';
import * as guardDutyDeployment from '../deployments/guardduty';
import * as snsDeployment from '../deployments/sns';
import * as ssmDeployment from '../deployments/ssm';
import { getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { logArchiveReadOnlyAccess } from '../deployments/s3/log-archive-read-access';
import * as metadataDeployment from '../deployments/metadata-collection';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import * as alb from '../deployments/alb';

/**
 * This is the main entry point to deploy phase 2
 *
 * - Create CloudTrail in Master account
 * - Create VPC Peering Connection
 * - Create Security Groups for shared VPC in sub accounts
 * - Setup Security Hub in Security Account
 * - Setup Cross Account CloudWatch logs sharing by creating roles in sub accounts
 * - Enable VPC FlowLogs
 * - Create Active Directory (MAD)
 * - Create Firewall clusters
 * - Create Firewall Management instance
 * - Create Transit Gateway Routes, Association and Propagation
 * - Enable Macie in Security account and Create Members, Update Config
 * - GuardDuty - Add existing Org accounts as members and allow new accounts to be members and Publish
 * - Create SNS Topics in Log Account
 * - TGW Peering Attachments
 */

export async function deploy({
  acceleratorConfig,
  accountStacks,
  accounts,
  context,
  outputs,
  limiter,
  organizations,
}: PhaseInput) {
  const { defaultRegion } = context;
  const rootOuId = organizations[0].rootOrgId!;
  // Find the account buckets in the outputs
  const accountBuckets = AccountBucketOutput.getAccountBuckets({
    accounts,
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  const aesLogArchiveBucket = AesBucketOutput.getBucket({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  await createTrail.step1({
    accountBuckets,
    accountStacks,
    config: acceleratorConfig,
    outputs,
    context,
  });

  const vpcConfigs = acceleratorConfig.getVpcConfigs();
  /**
   * Add NFW Routes if they exist
   *
   */

  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      vpcName: vpcConfig.name,
      region: vpcConfig.region,
      accountKey,
    });
    if (!vpcOutput) {
      console.warn(`Cannot find output with vpc name ${vpcConfig.name}`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nfwNameToIdMap = vpcOutput.nfw?.reduce((acc: any, nfwConfig) => {
      const vpcEndpointAz = nfwConfig.az.slice(-1);
      const vpcEndpointId = nfwConfig.vpcEndpoint;
      const mapSubnet = nfwConfig.subnets.filter(subnet => {
        return vpcEndpointAz === subnet.az;
      });
      acc[`NFW_${mapSubnet[0].subnetName}_az${vpcEndpointAz.toUpperCase()}`.toLowerCase()] = vpcEndpointId;
      return acc;
    }, {});
    console.log(nfwNameToIdMap);
    const routeTables = vpcConfig['route-tables'] || [];
    for (const routeTable of routeTables) {
      for (const route of routeTable.routes || []) {
        if (route.target.startsWith('NFW_')) {
          if (typeof route.destination !== 'string') {
            console.warn(`Route for NFW only supports cidr as destination`);
            continue;
          }
          let constructName = `${routeTable.name}_nfw_route`;
          if (route.destination !== '0.0.0.0/0') {
            constructName = `${routeTable.name}_nfw_${route.destination}_route`;
          }
          const routeParams: ec2.CfnRouteProps = {
            routeTableId: vpcOutput.routeTables[routeTable.name],
            destinationCidrBlock: route.destination,
            vpcEndpointId: nfwNameToIdMap[route.target.toLowerCase()],
          };
          new ec2.CfnRoute(accountStack, constructName, routeParams);
        }
      }
    }
  }

  /**
   * Code to create Peering Connection in all accounts
   */

  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const pcxConfig = vpcConfig.pcx;
    if (!PeeringConnectionConfig.is(pcxConfig)) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const pcxAcceptRole = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: pcxConfig.source,
      roleKey: 'PeeringConnectionAcceptRole',
    });
    let peerRoleArn = '';
    if (pcxAcceptRole) {
      peerRoleArn = pcxAcceptRole.roleArn;
    } else {
      const roleName = createRoleName(`VPC-PCX-${pascalCase(accountKey)}To${pascalCase(pcxConfig.source)}`, 0);
      peerRoleArn = `arn:aws:iam::${getAccountId(accounts, pcxConfig.source)}:role/${roleName}`;
    }

    // Get Peer VPC Configuration
    const pcxSourceVpc = pcxConfig['source-vpc'];
    const peerVpcConfig = getVpcConfig(vpcConfigs, pcxConfig.source, pcxSourceVpc);
    if (!VpcConfigType.is(peerVpcConfig)) {
      console.warn(`No configuration found for Peer VPC "${pcxSourceVpc}"`);
      continue;
    }
    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      vpcName: vpcConfig.name,
    });
    if (!vpcOutput) {
      console.warn(`No VPC Found in outputs for VPC name "${vpcConfig.name}"`);
      continue;
    }
    const peerVpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey: pcxConfig.source,
      vpcName: pcxSourceVpc,
    });
    if (!peerVpcOutput) {
      console.warn(`No VPC Found in outputs for VPC name "${pcxSourceVpc}"`);
      continue;
    }
    const peerOwnerId = getAccountId(accounts, pcxConfig.source);

    const pcx = new ec2.CfnVPCPeeringConnection(accountStack, `${vpcConfig.name}-${pcxSourceVpc}_pcx`, {
      vpcId: vpcOutput.vpcId,
      peerVpcId: peerVpcOutput.vpcId,
      peerRoleArn,
      peerOwnerId,
    });

    new StructuredOutput<PcxOutput>(accountStack, `PcxOutput${vpcConfig.name}`, {
      type: PcxOutputType,
      value: {
        pcxId: pcx.ref,
        vpcs: [
          {
            accountKey,
            vpcId: vpcOutput.vpcId,
            vpcName: vpcOutput.vpcName,
          },
          {
            accountKey: pcxConfig.source,
            vpcId: peerVpcOutput.vpcId,
            vpcName: peerVpcOutput.vpcName,
          },
        ],
      },
    });
  }

  // Creating Security Groups in shared accounts to respective accounts
  for (const { ouKey, accountKey, vpcConfig } of vpcConfigs) {
    const sharedToAccountKeys = getVpcSharedAccountKeys(accounts, vpcConfig, ouKey);
    const shareToAccountIds = Array.from(new Set(sharedToAccountKeys));
    if (sharedToAccountKeys.length > 0) {
      console.log(`Share VPC "${vpcConfig.name}" from Account "${accountKey}" to Accounts "${shareToAccountIds}"`);
    }

    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      region: vpcConfig.region,
      vpcName: vpcConfig.name,
    });
    if (!vpcOutput) {
      console.warn(`No VPC Found in outputs for VPC name "${vpcConfig.name}"`);
      continue;
    }

    for (const [index, sharedAccountKey] of shareToAccountIds.entries()) {
      // Initiating Security Group creation in shared account
      const accountStack = accountStacks.tryGetOrCreateAccountStack(sharedAccountKey, vpcConfig.region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${sharedAccountKey}`);
        continue;
      }

      /* **********************************************************
       * Saving index in outputs to handle nasty bug occur while
       * changing construct name when account is suspended
       * *********************************************************/
      const sgOutputs: SharedSecurityGroupIndexOutput[] = getStackJsonOutput(outputs, {
        accountKey: sharedAccountKey,
        outputType: 'SecurityGroupIndexOutput',
        region: vpcConfig.region,
      });

      const vpcSgIndex = sgOutputs.find(sgO => sgO.vpcName === vpcConfig.name);
      let sgIndex = index + 1;
      if (vpcSgIndex) {
        sgIndex = vpcSgIndex.index;
      }
      const securityGroupStack = new cdk.NestedStack(accountStack, `SecurityGroups${vpcConfig.name}-Shared-${sgIndex}`);
      const securityGroups = new SecurityGroup(securityGroupStack, `SecurityGroups-SharedAccount-${sgIndex}`, {
        securityGroups: vpcConfig['security-groups']!,
        vpcName: vpcConfig.name,
        vpcId: vpcOutput.vpcId,
        accountKey,
        vpcConfigs,
        sharedAccountKey,
        installerVersion: context.installerVersion,
      });

      // Add Tags Output
      const securityGroupsResources = Object.values(securityGroups.securityGroupNameMapping);

      new JsonOutputValue(securityGroupStack, `SecurityGroupOutput  `, {
        type: 'SecurityGroupsOutput',
        value: {
          vpcId: vpcOutput.vpcId,
          vpcName: vpcConfig.name,
          securityGroupIds: securityGroups.securityGroups.map(securityGroup => ({
            securityGroupId: securityGroup.id,
            securityGroupName: securityGroup.name,
          })),
        },
      });

      new JsonOutputValue(securityGroupStack, `SecurityGroupIndexOutput`, {
        type: 'SecurityGroupIndexOutput',
        value: {
          vpcName: vpcConfig.name,
          index: sgIndex,
        },
      });

      const accountId = getAccountId(accounts, accountKey);
      if (!accountId) {
        console.warn(`Cannot find account with key ${accountKey}`);
        continue;
      }

      new AddTagsToResourcesOutput(securityGroupStack, `OutputSharedResources${vpcConfig.name}-Shared-${index}`, {
        dependencies: securityGroupsResources,
        produceResources: () =>
          securityGroupsResources.map(securityGroup => ({
            resourceId: securityGroup.ref,
            resourceType: 'security-group',
            targetAccountIds: [accountId],
            tags: securityGroup.tags.renderTags(),
            region: securityGroupStack.region,
          })),
      });
    }
  }

  // Deploy Security Hub in Security Account
  // Enables Security Hub, Standards and send invites to member accounts
  await securityHub.step1({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
    acceleratorPrefix: context.acceleratorPrefix,
  });

  // Central Services step 2
  await centralServices.step2({
    accountStacks,
    config: acceleratorConfig,
    accounts,
    context,
    outputs,
    rootOuId,
  });

  // Import all VPCs from all outputs
  const allVpcOutputs = VpcOutputFinder.findAll({ outputs });
  const allVpcs = allVpcOutputs.map(vpcDeployment.ImportedVpc.fromOutput);

  // Find the central bucket in the outputs
  const centralBucket = CentralBucketOutput.getBucket({
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  await vpcDeployment.step2({
    accountBuckets,
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  await madDeployment.step2({
    acceleratorExecutionRoleName: context.acceleratorExecutionRoleName,
    acceleratorPrefix: context.acceleratorPrefix,
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  await firewallCluster.step3({
    accountBuckets,
    accountStacks,
    centralBucket,
    config: acceleratorConfig,
    outputs,
    vpcs: allVpcs,
    accounts,
    defaultRegion,
  });

  await firewallManagement.step1({
    accountStacks,
    config: acceleratorConfig,
    vpcs: allVpcs,
    outputs,
    accounts,
    defaultRegion,
  });

  await tgwDeployment.step2({
    accountStacks,
    accounts,
    outputs,
  });

  // Macie step 2
  await macie.step2({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });

  /**
   * Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
   * Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
   *
   * @param props accountStacks and config passed from phases
   */
  await guardDutyDeployment.step2({
    accountStacks,
    config: acceleratorConfig,
    accounts,
    outputs,
  });

  /**
   * Creating required SNS Topics in Log accont
   */
  await snsDeployment.step1({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    accounts,
  });

  const logBucket = accountBuckets[acceleratorConfig['global-options']['central-log-services'].account];
  await guardDutyDeployment.step3({
    accountStacks,
    config: acceleratorConfig,
    accounts,
    logBucket,
    outputs,
  });

  await logArchiveReadOnlyAccess({
    accountStacks,
    accounts,
    logBucket,
    aesLogBucket: aesLogArchiveBucket,
    config: acceleratorConfig,
    acceleratorPrefix: context.acceleratorPrefix,
  });

  if (acceleratorConfig['global-options']['meta-data-collection']) {
    metadataDeployment.createMetadataService({
      acceleratorPrefix: context.acceleratorPrefix,
      accountStacks,
      accounts,
      config: acceleratorConfig,
      configBucket: centralBucket.bucketName,
      outputs,
    });
  }

  await tgwDeployment.acceptPeeringAttachment({
    accountStacks,
    accounts,
    config: acceleratorConfig,
    outputs,
  });

  const masterAccountKey = acceleratorConfig['global-options']['aws-org-management'].account;
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  await vpcDeployment.step3({
    accountStacks,
    config: acceleratorConfig,
    limiter,
    outputs,
    accounts,
  });

  await ssmDeployment.createDocument({
    acceleratorExecutionRoleName: context.acceleratorExecutionRoleName,
    centralAccountId: masterAccountId!,
    centralBucketName: centralBucket.bucketName,
    config: acceleratorConfig,
    accountStacks,
    accounts,
    outputs,
  });

  await ssmDeployment.inventoryCollection({
    acceleratorPrefix: context.acceleratorPrefix,
    logBucketName: logBucket.bucketName,
    acceleratorConfig,
    accountStacks,
  });

  await alb.step1({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    aesLogArchiveBucket,
    acceleratorExecutionRoleName: context.acceleratorExecutionRoleName,
    accounts,
    deployGlb: true,
  });
}
