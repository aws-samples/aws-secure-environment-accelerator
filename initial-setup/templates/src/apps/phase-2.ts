import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as cfn from '@aws-cdk/aws-cloudformation';
import { getAccountId } from '../utils/accounts';
import { JsonOutputValue } from '../common/json-output';
import { getVpcConfig } from '../common/get-all-vpcs';
import { VpcOutput, ImportedVpc } from '../deployments/vpc';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import * as ec2 from '@aws-cdk/aws-ec2';
import { ActiveDirectory } from '../common/active-directory';
import { PeeringConnectionConfig, VpcConfigType } from '@aws-pbmm/common-lambda/lib/config';
import { getVpcSharedAccountKeys } from '../common/vpc-subnet-sharing';
import { SecurityGroup } from '../common/security-group';
import { AddTagsToResourcesOutput } from '../common/add-tags-to-resources-output';
import * as firewallManagement from '../deployments/firewall/manager';
import * as firewallCluster from '../deployments/firewall/cluster';
import { SecurityHubStack } from '../common/security-hub';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { CentralBucketOutput, AccountBucketOutput } from '../deployments/defaults';
import { PcxOutput, PcxOutputType } from '../deployments/vpc-peering/outputs';
import { StructuredOutput } from '../common/structured-output';
import { PhaseInput } from './shared';
import { getMadRootPasswordSecretArn } from '../deployments/mad';

/**
 * This is the main entry point to deploy phase 2.
 *
 * The following resources are deployed in phase 2:
 *   - Creates Peering Connection
 */

export async function deploy({ acceleratorConfig, accountStacks, accounts, context, outputs }: PhaseInput) {
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const securityAccountKey = acceleratorConfig.getMandatoryAccountKey('central-security');

  /**
   * Code to create Peering Connection in all accounts
   */

  const vpcConfigs = acceleratorConfig.getVpcConfigs();
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const pcxConfig = vpcConfig.pcx;
    if (!PeeringConnectionConfig.is(pcxConfig)) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    // TODO store role name in outputs
    // Get the exact same role name as in phase 1
    const roleName = createRoleName(`VPC-PCX-${pascalCase(accountKey)}To${pascalCase(pcxConfig.source)}`, 0);
    const peerRoleArn = `arn:aws:iam::${getAccountId(accounts, pcxConfig.source)}:role/${roleName}`;

    // Get Peer VPC Configuration
    const pcxSourceVpc = pcxConfig['source-vpc'];
    const peerVpcConfig = getVpcConfig(vpcConfigs, pcxConfig.source, pcxSourceVpc);
    if (!VpcConfigType.is(peerVpcConfig)) {
      console.warn(`No configuration found for Peer VPC "${pcxSourceVpc}"`);
      continue;
    }
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    if (!vpcOutput) {
      console.warn(`No VPC Found in outputs for VPC name "${vpcConfig.name}"`);
      continue;
    }
    const peerVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey: pcxConfig.source,
      outputType: 'VpcOutput',
    });
    const peerVpcOutput = peerVpcOutputs.find(x => x.vpcName === pcxSourceVpc);
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

  const masterStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  const accountConfigs = acceleratorConfig.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }
    const accountId = getAccountId(accounts, accountKey);
    if (!accountId) {
      console.warn(`Cannot find account with key ${accountKey}`);
      continue;
    }

    const stack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!stack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const madPasswordSecretName = madDeploymentConfig['password-secret-name'];
    let madPasswordSecretArn;
    if (madPasswordSecretName) {
      madPasswordSecretArn = `arn:${cdk.Aws.PARTITION}:secretsmanager:${cdk.Aws.REGION}:${masterStack.accountId}:secret:${madPasswordSecretName}`;
    } else {
      madPasswordSecretArn = getMadRootPasswordSecretArn({
        acceleratorPrefix: context.acceleratorPrefix,
        accountKey,
        secretAccountId: masterStack.accountId,
      });
    }

    const madPasswordSecret = cdk.SecretValue.secretsManager(madPasswordSecretArn);

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(output => output.vpcName === madDeploymentConfig['vpc-name']);
    if (!vpcOutput) {
      console.warn(`Cannot find output with vpc name ${madDeploymentConfig['vpc-name']}`);
      continue;
    }

    const vpcId = vpcOutput.vpcId;
    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === madDeploymentConfig.subnet).map(s => s.subnetId);

    const activeDirectory = new ActiveDirectory(stack, 'Microsoft AD', {
      madDeploymentConfig,
      subnetInfo: {
        vpcId,
        subnetIds,
      },
      password: madPasswordSecret,
    });

    new JsonOutputValue(stack, 'MadOutput', {
      type: 'MadOutput',
      value: {
        id: madDeploymentConfig['dir-id'],
        vpcName: madDeploymentConfig['vpc-name'],
        directoryId: activeDirectory.directoryId,
        dnsIps: cdk.Fn.join(',', activeDirectory.dnsIps),
        passwordArn: madPasswordSecretArn,
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
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(x => x.vpcName === vpcConfig.name);
    for (const [index, sharedAccountKey] of shareToAccountIds.entries()) {
      // Initiating Security Group creation in shared account
      const accountStack = accountStacks.tryGetOrCreateAccountStack(sharedAccountKey);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${sharedAccountKey}`);
        continue;
      }

      const securityGroupStack = new cfn.NestedStack(
        accountStack,
        `SecurityGroups${vpcConfig.name}-Shared-${index + 1}`,
      );
      if (!vpcOutput) {
        console.warn(`No VPC Found in outputs for VPC name "${vpcConfig.name}"`);
        continue;
      }
      const securityGroups = new SecurityGroup(securityGroupStack, `SecurityGroups-SharedAccount-${index + 1}`, {
        securityGroups: vpcConfig['security-groups']!,
        vpcName: vpcConfig.name,
        vpcId: vpcOutput.vpcId,
        accountKey,
        vpcConfigs,
      });

      const accountId = getAccountId(accounts, accountKey);
      if (!accountId) {
        console.warn(`Cannot find account with key ${accountKey}`);
        continue;
      }

      // Add Tags Output
      const securityGroupsResources = Object.values(securityGroups.securityGroupNameMapping);

      new JsonOutputValue(securityGroupStack, `SecurityGroupOutput${vpcConfig.name}-${index}`, {
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

      new AddTagsToResourcesOutput(securityGroupStack, `OutputSharedResources${vpcConfig.name}-Shared-${index}`, {
        dependencies: securityGroupsResources,
        produceResources: () =>
          securityGroupsResources.map(securityGroup => ({
            resourceId: securityGroup.ref,
            resourceType: 'security-group',
            targetAccountIds: [accountId],
            tags: securityGroup.tags.renderTags(),
          })),
      });
    }
  }

  // Deploy Security Hub
  const globalOptions = acceleratorConfig['global-options'];
  const securityMasterAccount = accounts.find(a => a.key === securityAccountKey);

  for (const account of accounts) {
    if (account.id === securityMasterAccount?.id) {
      continue;
    }
    const memberAccountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!memberAccountStack) {
      console.warn(`Cannot find account stack ${account.key}`);
      continue;
    }
    new SecurityHubStack(memberAccountStack, `SecurityHubMember-${account.key}`, {
      account,
      standards: globalOptions['security-hub-frameworks'],
      masterAccountId: securityMasterAccount?.id,
    });
  }

  // TODO Find a better way to get VPCs
  // Import all VPCs from all outputs
  const allVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
    outputType: 'VpcOutput',
  });
  const allVpcs = allVpcOutputs.map(ImportedVpc.fromOutput);

  // Find the account buckets in the outputs
  const accountBuckets = AccountBucketOutput.getAccountBuckets({
    accounts,
    accountStacks,
    config: acceleratorConfig,
    outputs,
  });

  // Find the central bucket in the outputs
  const centralBucket = CentralBucketOutput.getBucket({
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
  });

  await firewallManagement.step1({
    accountStacks,
    config: acceleratorConfig,
    vpcs: allVpcs,
    outputs,
  });
}
