import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
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
      throw new Error(`Cannot find firewall VPN connection outputs`);
    }

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    await createFirewallCluster({
      accountBuckets,
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
  accountBuckets: { [accountKey: string]: s3.IBucket };
  centralBucket: s3.IBucket;
  firewallConfig: c.FirewallConfig;
  firewallVpnConnections: FirewallVpnConnection[];
  scope: cdk.Construct;
  vpc: Vpc;
}) {
  const { scope, vpc, centralBucket, firewallConfig, firewallVpnConnections } = props;

  const securityGroup = vpc.findSecurityGroupByName(firewallConfig['security-group']);

  // TODO Condition to check if `firewallConfig.license` and `firewallConfig.config` exist

  const cluster = new FirewallCluster(scope, 'Firewall', {
    vpcCidrBlock: vpc.cidrBlock,
    imageId: firewallConfig['image-id'],
    instanceType: firewallConfig['instance-sizes'],
    configuration: {
      bucket: centralBucket,
      bucketRegion: cdk.Aws.REGION,
      licensePath: firewallConfig.license,
      templateBucket: centralBucket,
      templateConfigPath: firewallConfig.config,
    },
  });

  // Make sure the cluster can read the license and write the configuration template
  centralBucket.grantRead(cluster.instanceRole);

  // We only need once firewall instance per availability zone
  const instancePerAz: { [az: string]: FirewallInstance } = {};

  for (const vpnConnection of firewallVpnConnections) {
    const az = vpnConnection.az;
    const subnetName = vpnConnection.subnetName;
    const subnet = vpc.findSubnetByNameAndAvailabilityZone(subnetName, az);

    let instance = instancePerAz[az];
    if (!instance) {
      const instanceName = `Fgt${pascalCase(az)}`;
      instance = cluster.createInstance(instanceName);
      instancePerAz[az] = instance;

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
