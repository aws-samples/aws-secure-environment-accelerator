import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { FirewallCluster, FirewallInstance } from '@aws-pbmm/constructs/lib/firewall';
import { ImageFinder } from '@custom-resources/ec2-image-finder';
import { AccountStacks } from '../../../common/account-stacks';
import { StructuredOutput } from '../../../common/structured-output';
import { FirewallVpnConnectionOutputType, FirewallVpnConnection } from './step-2';

export interface FirewallStep3Props {
  accountStacks: AccountStacks;
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
  const { accountStacks, config, outputs, vpcs } = props;

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
      scope: accountStack,
      vpc,
      firewallConfig,
      firewallVpnConnections,
    });
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFirewallCluster(props: {
  scope: cdk.Construct;
  vpc: Vpc;
  firewallConfig: c.FirewallConfig;
  firewallVpnConnections: FirewallVpnConnection[];
}) {
  const { scope, vpc, firewallConfig, firewallVpnConnections } = props;

  const imageFinder = new ImageFinder(scope, 'FirewallImage', {
    // FortiGate owner ID
    imageOwner: '679593333241',
    // If Bring-Your-Own-License, then use the AWS build, otherwise the AWSONDEMAND build
    imageName: firewallConfig.image === 'BYOL' ? 'FortiGate-VM64-AWS build*' : 'FortiGate-VM64-AWSONDEMAND build*',
    // Version is always wrapped in round brackets
    imageVersion: `*(${firewallConfig.version})*`,
  });

  const securityGroup = vpc.findSecurityGroupByName(firewallConfig['security-group']);

  const cluster = new FirewallCluster(scope, 'Firewall', {
    vpcCidrBlock: vpc.cidrBlock,
    imageId: imageFinder.imageId,
    instanceType: firewallConfig['instance-sizes'],
  });

  // We only need once firewall instance per availability zone
  const instancePerAz: { [az: string]: FirewallInstance } = {};

  for (const vpnConnection of firewallVpnConnections) {
    const az = vpnConnection.az;
    const subnetName = vpnConnection.subnetName;
    const subnet = vpc.findSubnetByNameAndAvailabilityZone(subnetName, az);

    let instance = instancePerAz[az];
    if (!instance) {
      instance = cluster.createInstance(`Fgt${pascalCase(az)}`);
      instancePerAz[az] = instance;
    }

    instance.addNetworkInterface({
      subnet,
      securityGroup,
      ipCidr: vpnConnection.internalIpCidr,
      eipAllocationId: vpnConnection?.eipAllocationId,
    });
  }
  return cluster;
}
