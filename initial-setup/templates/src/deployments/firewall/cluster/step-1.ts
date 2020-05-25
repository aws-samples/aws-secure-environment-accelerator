import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../../common/account-stacks';
import { StructuredOutput } from '../../../common/structured-output';
import { FirewallPort, FirewallPortOutput, FirewallPortOutputType } from './outputs';

export interface FirewallStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

/**
 * Creates the EIPs for the firewall instances.
 *
 * This step outputs the following:
 *   - Firewall ports with EIPs for all accounts with a firewall deployment
 */
export async function step1(props: FirewallStep1Props) {
  const { accountStacks, config } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const firewallConfig = accountConfig.deployments?.firewall;
    if (!firewallConfig) {
      continue;
    }

    const vpcConfigs = config.getVpcConfigs();
    const vpcConfig = vpcConfigs.map(obj => obj.vpcConfig).find(v => v.name === firewallConfig.vpc);
    if (!vpcConfig) {
      console.log(`Skipping firewall deployment because of missing VPC "${firewallConfig.vpc}"`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    // TODO We could create a nested stack here
    await createFirewallEips({
      scope: accountStack,
      vpcConfig,
      firewallConfig,
    });
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFirewallEips(props: {
  scope: cdk.Construct;
  vpcConfig: c.VpcConfig;
  firewallConfig: c.FirewallConfig;
}) {
  const { scope, vpcConfig, firewallConfig } = props;

  const firewallCgwName = firewallConfig['fw-cgw-name'];

  // Keep track of the created ports and EIPs so we can use them in the next steps
  const ports: FirewallPort[] = [];

  // Create a firewall EIP in every availability zone
  const subnetDefinitions = vpcConfig.subnets?.flatMap(s => s.definitions) || [];
  const azs = subnetDefinitions.map(def => def.az);
  for (const az of new Set(azs)) {
    for (const [index, port] of Object.entries(firewallConfig.ports)) {
      let eip;
      if (port['create-eip']) {
        eip = new ec2.CfnEIP(scope, `${firewallCgwName}_az${pascalCase(az)}_${index}_eip`, {
          domain: 'vpc',
        });
      }

      ports.push({
        name: port.name,
        subnetName: port.subnet,
        az,
        eipIpAddress: eip?.ref,
        eipAllocationId: eip?.attrAllocationId,
        createCustomerGateway: port['create-cgw'],
      });
    }
  }

  new StructuredOutput<FirewallPortOutput>(scope, 'FirewallPortOutput', {
    type: FirewallPortOutputType,
    value: ports,
  });
}
