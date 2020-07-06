import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { TransitGatewayOutputFinder, TransitGatewayOutput } from '@aws-pbmm/common-outputs/lib/transit-gateway';
import { VpnTunnelOptions } from '@custom-resources/ec2-vpn-tunnel-options';
import { VpnAttachments } from '@custom-resources/ec2-vpn-attachment';
import { AccountStacks } from '../../../common/account-stacks';
import { AddTagsToResourcesOutput, AddTagsToResource } from '../../../common/add-tags-to-resources-output';
import {
  FirewallPort,
  FirewallVpnConnection,
  CfnFirewallVpnConnectionOutput,
  FirewallPortOutputFinder,
} from './outputs';

export interface FirewallStep2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
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
  const { accountStacks, config, outputs } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const firewallConfig = accountConfig.deployments?.firewall;
    if (!firewallConfig) {
      continue;
    }

    const attachConfig = firewallConfig['tgw-attach'];
    if (!c.TransitGatewayAttachConfigType.is(attachConfig)) {
      continue;
    }

    // Find the firewall EIPs in the firewall account
    const firewallPortOutputs = FirewallPortOutputFinder.findAll({
      outputs,
      accountKey,
      region: firewallConfig.region,
    });
    const firewallPorts = firewallPortOutputs.flatMap(array => array);
    if (firewallPorts.length === 0) {
      console.warn(`Cannot find firewall port outputs in account "${accountKey}"`);
      continue;
    }

    const tgwAccountKey = attachConfig.account;
    const tgwName = attachConfig['associate-to-tgw'];
    const transitGateway = TransitGatewayOutputFinder.tryFindOneByName({
      outputs,
      accountKey: tgwAccountKey,
      name: tgwName,
    });
    if (!transitGateway) {
      console.warn(`Cannot find transit gateway "${tgwName}" in account "${tgwAccountKey}"`);
      continue;
    }

    const tgwAccountStack = accountStacks.tryGetOrCreateAccountStack(tgwAccountKey, transitGateway.region);
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
      attachConfig,
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
  transitGateway: TransitGatewayOutput;
  attachConfig: c.TransitGatewayAttachConfig;
}) {
  const { scope, firewallAccountKey, firewallConfig, firewallPorts, transitGateway, attachConfig } = props;

  // Keep track of the created VPN connection so we can use them in the next steps
  const vpnConnections: FirewallVpnConnection[] = [];

  const firewallCgwName = firewallConfig['fw-cgw-name'];
  const firewallCgwAsn = firewallConfig['fw-cgw-asn'];

  const addTagsDependencies = [];
  const addTagsToResources: AddTagsToResource[] = [];

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

      // Make sure to add the tags to the VPN attachments
      addTagsDependencies.push(attachments);
      addTagsToResources.push({
        targetAccountIds: [cdk.Aws.ACCOUNT_ID],
        resourceId: attachments.getTransitGatewayAttachmentId(0),
        resourceType: 'tgw-attachment',
        tags: [
          {
            key: 'Name',
            value: `${prefix}_att`,
          },
        ],
      });

      const associateConfig = attachConfig['tgw-rt-associate'] || [];
      const propagateConfig = attachConfig['tgw-rt-propagate'] || [];

      const tgwRouteAssociates = associateConfig.map(route => transitGateway.tgwRouteTableNameToIdMap[route]);
      const tgwRoutePropagates = propagateConfig.map(route => transitGateway.tgwRouteTableNameToIdMap[route]);

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

  // Output the tags that need to be added to the VPN attachments
  if (addTagsToResources.length > 0) {
    new AddTagsToResourcesOutput(scope, `VpnAttachmentsTags`, {
      dependencies: addTagsDependencies,
      produceResources: () => addTagsToResources,
    });
  }

  // Store the firewall VPN connections as outputs
  new CfnFirewallVpnConnectionOutput(scope, 'FirewallVpnConnections', vpnConnections);
}
