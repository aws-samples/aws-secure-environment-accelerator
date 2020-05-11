import { pascalCase } from 'pascal-case';
import * as t from 'io-ts';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { optional } from '@aws-pbmm/common-lambda/lib/config/types';
import { AccountStacks } from '../../../common/account-stacks';
import { StructuredOutput } from '../../../common/structured-output';

export interface FirewallStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

export const FirewallPortType = t.interface({
  subnetName: t.string,
  az: t.string,
  internalIpCidr: t.string,
  eipIpAddress: optional(t.string),
  eipAllocationId: optional(t.string),
});

export const FirewallPortOutputType = t.array(FirewallPortType, 'FirewallPortOutput');

export type FirewallPort = t.TypeOf<typeof FirewallPortType>;
export type FirewallPortOutput = t.TypeOf<typeof FirewallPortOutputType>;

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

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
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

  // Keep track of the created ports and EIPs so we can use them in the next steps
  const ports: FirewallPort[] = [];

  // Create a firewall EIP in every availability zone
  const subnetDefinitions = vpcConfig.subnets?.flatMap(s => s.definitions) || [];
  const azs = subnetDefinitions.map(def => def.az);
  for (const az of new Set(azs)) {
    for (const [index, port] of Object.entries(firewallConfig.eni.ports)) {
      const ipCidr = port['internal-ip-addresses'][az];
      if (!ipCidr) {
        throw new Error(`Cannot find IP CIDR for firewall port for subnet "${port.subnet}"`);
      }

      let eip;
      if (port.eip) {
        // TODO Name Perimeter_fw1_azA_eip
        eip = new ec2.CfnEIP(scope, `Eip${pascalCase(az)}${index}`, {
          domain: 'vpc',
        });
      }

      ports.push({
        subnetName: port.subnet,
        az,
        internalIpCidr: ipCidr.toCidrString(),
        eipIpAddress: eip?.ref,
        eipAllocationId: eip?.attrAllocationId,
      });
    }
  }

  new StructuredOutput<FirewallPortOutput>(scope, 'FirewallPortOutput', {
    type: FirewallPortOutputType,
    value: ports,
  });
}
