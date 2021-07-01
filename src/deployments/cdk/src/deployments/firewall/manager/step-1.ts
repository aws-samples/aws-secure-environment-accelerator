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
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { addReplacementsToUserData } from '../cluster/step-4';
import { Account } from '../../../utils/accounts';

export interface FirewallManagerStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  vpcs: Vpc[];
  outputs: StackOutput[];
  defaultRegion: string;
  accounts: Account[];
}

/**
 * Creates the firewall management instance.
 *
 * The following outputs are necessary from previous steps:
 *   - VPC with the name equals firewallManagementConfig.vpc and with the necessary subnets and security group
 */
export async function step1(props: FirewallManagerStep1Props) {
  const { accountStacks, config, vpcs, outputs, accounts, defaultRegion } = props;

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

    const keyPairs = accountConfig['key-pairs'].filter(kp => kp.region === managerConfig.region).map(kp => kp.name);
    let keyName = managerConfig['key-pair'];
    if (keyName && keyPairs.includes(keyName)) {
      keyName = createName({
        name: keyName,
        suffixLength: 0,
      });
    }

    await createFirewallManager({
      scope: accountStack,
      vpc,
      firewallManagerConfig: managerConfig,
      keyPairName: keyName,
      userData: managerConfig['user-data']
        ? await addReplacementsToUserData({
            accountKey,
            accountStack,
            config,
            defaultRegion,
            outputs,
            userData: managerConfig['user-data'],
            accounts,
            fwManagerName: managerConfig.name,
            launchConfigName:
              accountConfig.deployments?.firewalls?.find(fwc => fwc.type === 'autoscale' && fwc.deploy)?.name ||
              undefined,
            fwRegion: managerConfig.region,
            bootstrap: managerConfig.bootstrap,
          })
        : undefined,
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
  keyPairName?: string;
  userData?: string;
}) {
  const { scope, vpc, firewallManagerConfig: config, keyPairName, userData } = props;

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

  const blockDeviceMappings: ec2.CfnInstance.BlockDeviceMappingProperty[] = config['block-device-mappings'].map(
    deviceName => ({
      deviceName,
      ebs: {
        encrypted: true,
      },
    }),
  );
  const manager = new FirewallManager(scope, 'FirewallManager', {
    name: createName({
      name: config.name,
      suffixLength: 0,
    }),
    imageId: config['image-id'],
    instanceType: config['instance-sizes'],
    blockDeviceMappings,
    userData,
    keyPairName,
  });

  for (const [key, value] of Object.entries(config['apply-tags'] || {})) {
    cdk.Tags.of(manager).add(key, value);
  }

  manager.addNetworkInterface({
    securityGroup,
    subnet,
    eipAllocationId: eip?.attrAllocationId,
  });
}
