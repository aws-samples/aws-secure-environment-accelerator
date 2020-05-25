import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { FirewallManager } from '@aws-pbmm/constructs/lib/firewall';
import { AccountStacks } from '../../../common/account-stacks';

export interface FirewallManagerStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  vpcs: Vpc[];
}

/**
 * Creates the firewall management instance.
 *
 * The following outputs are necessary from previous steps:
 *   - VPC with the name equals firewallManagementConfig.vpc and with the necessary subnets and security group
 */
export async function step1(props: FirewallManagerStep1Props) {
  const { accountStacks, config, vpcs } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const managerConfig = accountConfig.deployments?.['firewall-manager'];
    if (!managerConfig) {
      continue;
    }

    const vpc = vpcs.find(v => v.name === managerConfig.vpc);
    if (!vpc) {
      console.log(`Skipping firewall manager deployment because of missing VPC "${managerConfig.vpc}"`);
      continue;
    }

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    await createFirewallManager({
      scope: accountStack,
      vpc,
      firewallManagerConfig: managerConfig,
    });
  }
}

/**
 * Create firewall management instance for the given VPC and config in the given scope.
 */
async function createFirewallManager(props: {
  scope: cdk.Construct;
  vpc: Vpc;
  firewallManagerConfig: c.FirewallManagerConfig;
}) {
  const { scope, vpc, firewallManagerConfig: config } = props;

  const subnetConfig = config.subnet;
  const subnet = vpc.findSubnetByNameAndAvailabilityZone(subnetConfig.name, subnetConfig.az);
  const securityGroup = vpc.findSecurityGroupByName(config['security-group']);

  if (!subnet || !securityGroup) {
    return;
  }

  let eip;
  if (config['create-eip']) {
    eip = new ec2.CfnEIP(scope, `${config.name}_eip`, {
      domain: 'vpc',
    });
  }

  const manager = new FirewallManager(scope, 'FirewallManager', {
    imageId: config['image-id'],
    instanceType: config['instance-sizes'],
  });

  manager.addNetworkInterface({
    securityGroup,
    subnet,
    eipAllocationId: eip?.attrAllocationId,
  });
}
