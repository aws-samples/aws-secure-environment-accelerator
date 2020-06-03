import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { VpnTunnelOptions } from '@custom-resources/ec2-vpn-tunnel-options';
import { VpnAttachments } from '@custom-resources/ec2-vpn-attachment';
import { AccountStacks } from '../../../common/account-stacks';
import { StructuredOutput } from '../../../common/structured-output';
import { TransitGateway } from '../../../common/transit-gateway';
import {
  FirewallPortOutputType,
  FirewallPort,
  FirewallVpnConnection,
  FirewallVpnConnectionOutput,
  FirewallVpnConnectionOutputType,
} from './outputs';

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
      console.warn(`Cannot find firewall port outputs in account "${accountKey}"`);
      continue;
    }

    const tgwAttach = firewallConfig['tgw-attach'];
    const tgwAccountKey = tgwAttach.account;
    const tgwName = tgwAttach['associate-to-tgw'];

    // TODO Validate account
    const transitGateway = transitGateways.get(tgwName);
    if (!transitGateway) {
      console.warn(`Cannot find transit gateway "${tgwName}" in account "${tgwAccountKey}"`);
      continue;
    }

    const tgwAccountStack = accountStacks.tryGetOrCreateAccountStack(tgwAccountKey);
    if (!tgwAccountStack) {
      console.warn(`Cannot find account stack ${tgwAccountKey}`);
      continue;
    }

    await createCustomerGateways({
      scope: tgwAccountStack,
      firewallAccountKey: accountKey,
      firewallConfig,
      firewallPorts,
      transitGateway,
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
  transitGateway: TransitGateway;
}) {
  const { scope, firewallAccountKey, firewallConfig, firewallPorts, transitGateway } = props;

  // Keep track of the created VPN connection so we can use them in the next steps
  const vpnConnections: FirewallVpnConnection[] = [];

  const firewallCgwName = firewallConfig['fw-cgw-name'];
  const firewallCgwAsn = firewallConfig['fw-cgw-asn'];
  const tgwAttach = firewallConfig['tgw-attach'];

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
        transitGatewayId: transitGateway.tgwId,
        customerGatewayId: customerGateway.ref,
      });

      const options = new VpnTunnelOptions(scope, `VpnTunnelOptions${index}`, {
        vpnConnectionId: vpnConnection.ref,
      });

      vpnTunnelOptions = {
        cgwTunnelInsideAddress1: options.getAttString('CgwInsideIpAddress1'),
        cgwTunnelOutsideAddress1: options.getAttString('CgwOutsideIpAddress1'),
        cgwBgpAsn1: options.getAttString('CgwBgpAsn1'),
        vpnTunnelInsideAddress1: options.getAttString('VpnInsideIpAddress1'),
        vpnTunnelOutsideAddress1: options.getAttString('VpnOutsideIpAddress1'),
        vpnBgpAsn1: options.getAttString('VpnBgpAsn1'),
        preSharedSecret1: options.getAttString('PreSharedKey1'),
      };

      // Creating VPN connection route table association and propagation
      const attachments = new VpnAttachments(scope, `VpnAttachments${index}`, {
        vpnConnectionId: vpnConnection.ref,
        tgwId: transitGateway.tgwId,
      });

      const associateConfig = tgwAttach['rt-associate'] || [];
      const propagateConfig = tgwAttach['rt-propagate'] || [];

      const tgwRouteAssociates = associateConfig.map(route => transitGateway.getRouteTableIdByName(route)!);
      const tgwRoutePropagates = propagateConfig.map(route => transitGateway.getRouteTableIdByName(route)!);

      for (const [routeIndex, route] of tgwRouteAssociates?.entries()) {
        new ec2.CfnTransitGatewayRouteTableAssociation(scope, `tgw_associate_${index}_${routeIndex}`, {
          transitGatewayAttachmentId: attachments.getTransitGatewayAttachmentId(0), // one vpn connection should only have one attachment
          transitGatewayRouteTableId: route,
        });
      }

      for (const [routeIndex, route] of tgwRoutePropagates?.entries()) {
        new ec2.CfnTransitGatewayRouteTablePropagation(scope, `tgw_propagate_${index}_${routeIndex}`, {
          transitGatewayAttachmentId: attachments.getTransitGatewayAttachmentId(0), // one vpn connection should only have one attachment
          transitGatewayRouteTableId: route,
        });
      }
    }

    vpnConnections.push({
      ...port,
      firewallAccountKey,
      transitGatewayId: transitGateway.tgwId,
      customerGatewayId: customerGateway?.ref,
      vpnConnectionId: vpnConnection?.ref,
      vpnTunnelOptions,
    });
  }

  // Store the firewall VPN connections as outputs
  new StructuredOutput<FirewallVpnConnectionOutput>(scope, 'FirewallVpnConnections', {
    type: FirewallVpnConnectionOutputType,
    value: vpnConnections,
  });
}
