import * as t from 'io-ts';
import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { optional } from '@aws-pbmm/common-lambda/lib/config/types';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { VpnTunnelOptions, Attribute } from '@custom-resources/vpn-tunnel-options';
import { AccountStacks } from '../../../common/account-stacks';
import { StructuredOutput } from '../../../common/structured-output';
import { TransitGateway } from '../../../common/transit-gateway';
import { FirewallPortOutputType, FirewallPortType, FirewallPort } from './step-1';

export interface FirewallStep2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  /**
   * Map with transit gateway name as key and the transit gateway itself as value.
   *
   * TODO Find a better way to pass around the transit gateway.
   */
  transitGateways: Map<string, TransitGateway>;
}

export const FirewallVpnConnectionType = t.intersection([
  FirewallPortType,
  t.interface({
    firewallAccountKey: t.string,
    transitGatewayId: t.string,
    customerGatewayId: optional(t.string),
    vpnConnectionId: optional(t.string),
  }),
]);

export const FirewallVpnConnectionOutputType = t.array(FirewallVpnConnectionType, 'FirewallVpnConnectionOutput');

export type FirewallVpnConnection = t.TypeOf<typeof FirewallVpnConnectionType>;
export type FirewallVpnConnectionOutput = t.TypeOf<typeof FirewallVpnConnectionOutputType>;

/**
 * Creates the customer gateways for the EIPs of the firewall.
 *
 * The following outputs are necessary from previous steps:
 *   - Firewall ports from step 1 of the firewall deployment
 *   - Transit gateway in the firewallConfig.tgw-attach.account
 *
 * This step outputs the following:
 *   - Firewall ports from step 1 with additional VPN connection info, if available
 */
export async function step2(props: FirewallStep2Props) {
  const { accountStacks, config, outputs, transitGateways } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const firewallConfig = accountConfig.deployments?.firewall;
    if (!firewallConfig) {
      continue;
    }

    // Find the firewall EIPs in the firewall account
    const firewallPortOutputs = StructuredOutput.fromOutputs(outputs, {
      type: FirewallPortOutputType,
      accountKey,
    });
    const firewallPorts = firewallPortOutputs.flatMap(array => array);
    if (firewallPorts.length === 0) {
      throw new Error(`Cannot find firewall port outputs in account "${accountKey}"`);
    }

    const tgwAttach = firewallConfig['tgw-attach'];
    const tgwAccountKey = tgwAttach.account;
    const tgwName = tgwAttach['associate-to-tgw'];

    // TODO Validate account
    const transitGateway = transitGateways.get(tgwName);
    if (!transitGateway) {
      throw new Error(`Cannot find transit gateway "${tgwName}" in account "${tgwAccountKey}"`);
    }

    const tgwAccountStack = accountStacks.getOrCreateAccountStack(tgwAccountKey);

    await createCustomerGateways({
      scope: tgwAccountStack,
      firewallAccountKey: accountKey,
      firewallConfig,
      firewallPorts,
      transitGatewayId: transitGateway.tgwId,
    });
  }
}

/**
 * Create customer gateway and VPN connections for the firewall EIPs of step 1.
 */
async function createCustomerGateways(props: {
  scope: cdk.Construct;
  firewallAccountKey: string;
  firewallConfig: c.FirewallConfig;
  firewallPorts: FirewallPort[];
  transitGatewayId: string;
}) {
  const { scope, firewallAccountKey, firewallConfig, firewallPorts, transitGatewayId } = props;

  // Keep track of the created VPN connection so we can use them in the next steps
  const vpnConnections: FirewallVpnConnection[] = [];

  const firewallCgwName = firewallConfig['fw-cgw-name'];
  const firewallCgwAsn = firewallConfig['fw-cgw-asn'];

  for (const [index, port] of Object.entries(firewallPorts)) {
    let customerGateway;
    let vpnConnection;
    let vpnTunnelOptions;
    if (port.eipIpAddress && port.createCustomerGateway) {
      const prefix = `${firewallCgwName}_az${pascalCase(port.az)}_${index}`;

      customerGateway = new ec2.CfnCustomerGateway(scope, `${prefix}_cgw`, {
        type: 'ipsec.1',
        ipAddress: port.eipIpAddress,
        bgpAsn: firewallCgwAsn,
      });

      vpnConnection = new ec2.CfnVPNConnection(scope, `${prefix}_vpn`, {
        type: 'ipsec.1',
        transitGatewayId,
        customerGatewayId: customerGateway.ref,
      });

      vpnTunnelOptions = new VpnTunnelOptions(scope, `VpnTunnelOptions${index}`, {
        vpnConnectionId: vpnConnection.ref,
      });
    }

    vpnConnections.push({
      ...port,
      firewallAccountKey,
      transitGatewayId,
      customerGatewayId: customerGateway?.ref,
      vpnConnectionId: vpnConnection?.ref,
    });
  }

  // Store the firewall VPN connections as outputs
  new StructuredOutput<FirewallVpnConnectionOutput>(scope, 'FirewallVpnConnections', {
    type: FirewallVpnConnectionOutputType,
    value: vpnConnections,
  });
}
