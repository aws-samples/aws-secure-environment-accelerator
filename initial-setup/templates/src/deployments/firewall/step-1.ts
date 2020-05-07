import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AvailabilityZone } from '@aws-pbmm/common-lambda/lib/config/types';
import { FirewallCluster } from '@aws-pbmm/constructs/lib/firewall';
import { ImageFinder } from '@aws-pbmm/custom-resource-image-finder';
import { AccountStacks } from '../../common/account-stacks';

export interface Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  vpcs: Vpc[];
}

/**
 * Creates the firewall clusters for the accounts that define a firewall deployment.
 */
export async function create(props: Props) {
  const { accountStacks, config, vpcs } = props;

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

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    await createFirewallCluster({
      scope: accountStack,
      vpc,
      firewallConfig,
    });
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFirewallCluster(props: { scope: cdk.Construct; vpc: Vpc; firewallConfig: c.FirewallConfig }) {
  const { scope, vpc, firewallConfig } = props;

  const imageFinder = new ImageFinder(scope, 'ImageFinder', {
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

  const azs = vpc.subnets.map(s => s.az);
  for (const az of new Set(azs)) {
    // Create one firewall instance in every availability zone
    const instance = cluster.createInstance(`Fgt${pascalCase(az)}`);

    for (const port of firewallConfig.eni.ports) {
      const subnet = vpc.findSubnetByNameAndAvailabilityZone(port.subnet, az);
      const ipCidr = port['internal-ip-addresses'][az as AvailabilityZone];
      if (!ipCidr) {
        throw new Error(`Cannot find IP CIDR for firewall port for subnet "${port.subnet}"`);
      }

      instance.addPort({
        subnet,
        securityGroup,
        ipCidr: ipCidr.toCidrString(),
        attachEip: port.eip,
      });
    }
  }
  return cluster;
}
