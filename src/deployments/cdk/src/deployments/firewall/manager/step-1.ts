import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-accelerator/common-config/src';
import { Vpc } from '@aws-accelerator/cdk-constructs/src/vpc';
import { FirewallManager } from '@aws-accelerator/cdk-constructs/src/firewall';
import { AccountStacks } from '../../../common/account-stacks';
import {
  StackOutput,
  getStackJsonOutput,
  OUTPUT_SUBSCRIPTION_REQUIRED,
} from '@aws-accelerator/common-outputs/src/stack-output';

export interface FirewallManagerStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  vpcs: Vpc[];
  outputs: StackOutput[];
}

/**
 * Creates the firewall management instance.
 *
 * The following outputs are necessary from previous steps:
 *   - VPC with the name equals firewallManagementConfig.vpc and with the necessary subnets and security group
 */
export async function step1(props: FirewallManagerStep1Props) {
  const { accountStacks, config, vpcs, outputs } = props;

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

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, managerConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }
    const subscriptionOutputs = getStackJsonOutput(outputs, {
      outputType: 'AmiSubscriptionStatus',
      accountKey,
    });

    const subscriptionStatus = subscriptionOutputs.find(sub => sub.imageId === managerConfig['image-id']);
    if (subscriptionStatus && subscriptionStatus.status === OUTPUT_SUBSCRIPTION_REQUIRED) {
      console.log(`AMI Marketplace subscription required for ImageId: ${managerConfig['image-id']}`);
      return;
    }

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
  const subnet = vpc.tryFindSubnetByNameAndAvailabilityZone(subnetConfig.name, subnetConfig.az);
  if (!subnet) {
    console.warn(`Cannot find subnet with name "${subnetConfig.name}" in availability zone "${subnetConfig.az}"`);
    return;
  }

  const securityGroup = vpc.tryFindSecurityGroupByName(config['security-group']);
  if (!securityGroup) {
    console.warn(`Cannot find security group with name "${config['security-group']}" in VPC "${vpc.name}"`);
    return;
  }

  let eip;
  if (config['create-eip']) {
    eip = new ec2.CfnEIP(scope, `${config.name}_eip`, {
      domain: 'vpc',
    });
  }

  const manager = new FirewallManager(scope, 'FirewallManager', {
    name: config.name,
    imageId: config['image-id'],
    instanceType: config['instance-sizes'],
  });

  manager.addNetworkInterface({
    securityGroup,
    subnet,
    eipAllocationId: eip?.attrAllocationId,
  });
}
