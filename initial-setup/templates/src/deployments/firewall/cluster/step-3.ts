import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { FirewallCluster, FirewallInstance } from '@aws-pbmm/constructs/lib/firewall';
import { AccountStacks } from '../../../common/account-stacks';
import { StructuredOutput } from '../../../common/structured-output';
import {
  FirewallVpnConnectionOutputType,
  FirewallVpnConnection,
  FirewallInstanceOutput,
  FirewallInstanceOutputType,
} from './outputs';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { OUTPUT_SUBSCRIPTION_REQUIRED } from '@aws-pbmm/common-outputs/lib/stack-output';

export interface FirewallStep3Props {
  accountBuckets: { [accountKey: string]: s3.IBucket };
  accountStacks: AccountStacks;
  centralBucket: s3.IBucket;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  vpcs: Vpc[];
}

/**
 * Creates the firewall clusters using the EIPs and customer gateways from previous steps.
 *
 * The following outputs are necessary from previous steps:
 *   - Firewall ports with optional VPN connections from step 2 of the firewall deployment
 *   - VPC with the name equals firewallConfig.vpc and with the necessary subnets and security group
 */
export async function step3(props: FirewallStep3Props) {
  const { accountBuckets, accountStacks, centralBucket, config, outputs, vpcs } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const firewallConfig = accountConfig.deployments?.firewall;
    if (!firewallConfig) {
      continue;
    }

    const vpc = vpcs.find(v => v.name === firewallConfig.vpc);
    if (!vpc) {
      console.log(`Skipping firewall deployment because of missing VPC "${firewallConfig.vpc}"`);
      continue;
    }

    const tgwAttach = firewallConfig['tgw-attach'];
    const tgwAccountKey = tgwAttach.account;

    // Find the firewall VPN connections in the TGW account
    const firewallVpnConnectionOutputs = StructuredOutput.fromOutputs(outputs, {
      type: FirewallVpnConnectionOutputType,
      accountKey: tgwAccountKey,
    });
    const firewallVpnConnections = firewallVpnConnectionOutputs
      .flatMap(array => array)
      .filter(conn => conn.firewallAccountKey === accountKey);
    if (firewallVpnConnections.length === 0) {
      console.warn(`Cannot find firewall VPN connection outputs`);
      continue;
    }

    const accountBucket = accountBuckets[accountKey];
    if (!accountBucket) {
      throw new Error(`Cannot find default account bucket for account ${accountKey}`);
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }
    const subscriptionOutputs = getStackJsonOutput(outputs, {
      outputType: 'AmiSubscriptionStatus',
      accountKey,
    });

    const subscriptionStatus = subscriptionOutputs.find(sub => sub.imageId === firewallConfig['image-id']);
    if (subscriptionStatus && subscriptionStatus.status === OUTPUT_SUBSCRIPTION_REQUIRED) {
      console.log(`AMI Marketplace subscription required for ImageId: ${firewallConfig['image-id']}`);
      return;
    }
    await createFirewallCluster({
      accountBucket,
      centralBucket,
      firewallConfig,
      firewallVpnConnections,
      scope: accountStack,
      vpc,
    });
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFirewallCluster(props: {
  accountBucket: s3.IBucket;
  centralBucket: s3.IBucket;
  firewallConfig: c.FirewallConfig;
  firewallVpnConnections: FirewallVpnConnection[];
  scope: cdk.Construct;
  vpc: Vpc;
}) {
  const { accountBucket, centralBucket, firewallConfig, firewallVpnConnections, scope, vpc } = props;

  const securityGroup = vpc.tryFindSecurityGroupByName(firewallConfig['security-group']);
  if (!securityGroup) {
    console.warn(`Cannot find security group with name "${firewallConfig['security-group']}" in VPC "${vpc.name}"`);
    return;
  }

  // TODO Condition to check if `firewallConfig.license` and `firewallConfig.config` exist

  const cluster = new FirewallCluster(scope, 'Firewall', {
    vpcCidrBlock: vpc.cidrBlock,
    imageId: firewallConfig['image-id'],
    instanceType: firewallConfig['instance-sizes'],
    roleName: createRoleName('Firewall'),
    configuration: {
      bucket: accountBucket,
      bucketRegion: cdk.Aws.REGION,
      templateBucket: centralBucket,
      templateConfigPath: firewallConfig.config,
    },
  });

  // Make sure the cluster can read the license and write the configuration template
  centralBucket.grantRead(cluster.instanceRole);

  // We only need once firewall instance per availability zone
  const instancePerAz: { [az: string]: FirewallInstance } = {};
  let licenseIndex: number = 0;

  for (const vpnConnection of firewallVpnConnections) {
    const az = vpnConnection.az;
    const subnetName = vpnConnection.subnetName;
    const subnet = vpc.tryFindSubnetByNameAndAvailabilityZone(subnetName, az);

    if (!subnet || !securityGroup) {
      console.warn(`Cannot find subnet with name "${subnetName}" in availability zone "${az}"`);
      continue;
    }

    let instance = instancePerAz[az];
    let licensePath: string | undefined;
    let licenseBucket: s3.IBucket | undefined;
    if (!instance) {
      if (firewallConfig.license && licenseIndex < firewallConfig.license.length) {
        licensePath = firewallConfig.license[licenseIndex];
        licenseBucket = centralBucket;
      }
      const instanceName = `Fgt${pascalCase(az)}`;
      instance = cluster.createInstance({
        name: instanceName,
        hostname: instanceName,
        licensePath,
        licenseBucket,
      });
      instancePerAz[az] = instance;
      licenseIndex++;

      new StructuredOutput<FirewallInstanceOutput>(scope, `Fgt${pascalCase(az)}Output`, {
        type: FirewallInstanceOutputType,
        value: {
          id: instance.instanceId,
          name: instanceName,
          az,
        },
      });
    }

    instance.addNetworkInterface({
      name: vpnConnection.name,
      subnet,
      securityGroup,
      eipAllocationId: vpnConnection.eipAllocationId,
      vpnTunnelOptions: vpnConnection.vpnTunnelOptions,
    });
  }
  return cluster;
}
