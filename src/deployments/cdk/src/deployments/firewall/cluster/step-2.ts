import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-accelerator/common-config/src';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { TransitGatewayOutputFinder, TransitGatewayOutput } from '@aws-accelerator/common-outputs/src/transit-gateway';
import { VpnTunnelOptions } from '@aws-accelerator/custom-resource-ec2-vpn-tunnel-options';
import { VpnAttachments } from '@aws-accelerator/custom-resource-ec2-vpn-attachment';
import { AccountStacks } from '../../../common/account-stacks';
import { AddTagsToResourcesOutput, AddTagsToResource } from '../../../common/add-tags-to-resources-output';
import {
  FirewallPort,
  FirewallVpnConnection,
  CfnFirewallVpnConnectionOutput,
  FirewallPortOutputFinder,
  TgwVpnAttachment,
  CfnTgwVpnAttachmentsOutput,
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
    const firewallConfigs = accountConfig.deployments?.firewalls;
    if (!firewallConfigs || firewallConfigs.length === 0) {
      continue;
    }

    for (const firewallConfig of firewallConfigs) {
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

      const attachConfig = firewallConfig['tgw-attach'];
      if (!c.TransitGatewayAttachConfigType.is(attachConfig)) {
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

      const tgwAccountStack = accountStacks.tryGetOrCreateAccountStack(tgwAccountKey, firewallConfig.region);
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
  const firewallCgwRouting = firewallConfig['fw-cgw-routing'].toLowerCase();

  const addTagsDependencies = [];
  const addTagsToResources: AddTagsToResource[] = [];
  const tgwAttachments: TgwVpnAttachment[] = [];

  for (const [index, port] of Object.entries(firewallPorts)) {
    if (port.firewallName !== firewallConfig.name) {
      continue;
    }

    let customerGateway;
    let vpnConnection;
    let vpnTunnelOptions;
    if (port.eipIpAddress && port.createCustomerGateway) {
      const prefix = `${firewallCgwName}_${port.subnetName}_az${pascalCase(port.az)}`;

      customerGateway = new ec2.CfnCustomerGateway(scope, `${prefix}_cgw`, {
        type: 'ipsec.1',
        ipAddress: port.eipIpAddress,
        bgpAsn: firewallCgwRouting === 'dynamic' ? firewallCgwAsn : 65000,
      });

      vpnConnection = new ec2.CfnVPNConnection(scope, `${prefix}_vpn`, {
        type: 'ipsec.1',
        transitGatewayId: transitGateway.tgwId,
        customerGatewayId: customerGateway.ref,
        staticRoutesOnly: firewallCgwRouting === 'static' ? true : false,
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
        cgwTunnelInsideAddress2: options.getAttString('CgwInsideIpAddress2'),
        cgwTunnelOutsideAddress2: options.getAttString('CgwOutsideIpAddress2'),
        cgwBgpAsn2: options.getAttString('CgwBgpAsn2'),
        vpnTunnelInsideAddress2: options.getAttString('VpnInsideIpAddress2'),
        vpnTunnelOutsideAddress2: options.getAttString('VpnOutsideIpAddress2'),
        vpnBgpAsn2: options.getAttString('VpnBgpAsn2'),
        preSharedSecret2: options.getAttString('PreSharedKey2'),
      };

      // Creating VPN connection route table association and propagation
      const attachments = new VpnAttachments(scope, `VpnAttachments${index}`, {
        vpnConnectionId: vpnConnection.ref,
        tgwId: transitGateway.tgwId,
      });

      tgwAttachments.push({
        subnet: port.subnetName,
        az: port.az,
        id: attachments.getTransitGatewayAttachmentId(0),
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
        region: cdk.Aws.REGION,
      });

      const associateConfig = attachConfig['tgw-rt-associate'] || [];
      const propagateConfig = attachConfig['tgw-rt-propagate'] || [];

      const tgwRouteAssociates = associateConfig.map(route => transitGateway.tgwRouteTableNameToIdMap[route]);
      const tgwRoutePropagates = propagateConfig.map(route => transitGateway.tgwRouteTableNameToIdMap[route]);

      for (const [routeIndex, route] of tgwRouteAssociates?.entries()) {
        new ec2.CfnTransitGatewayRouteTableAssociation(scope, `tgw_associate_${prefix}_${routeIndex}`, {
          transitGatewayAttachmentId: attachments.getTransitGatewayAttachmentId(0), // one vpn connection should only have one attachment
          transitGatewayRouteTableId: route,
        });
      }

      for (const [routeIndex, route] of tgwRoutePropagates?.entries()) {
        new ec2.CfnTransitGatewayRouteTablePropagation(scope, `tgw_propagate_${prefix}_${routeIndex}`, {
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
    new AddTagsToResourcesOutput(scope, `VpnAttachmentsTags${firewallConfig.name}`, {
      dependencies: addTagsDependencies,
      produceResources: () => addTagsToResources,
    });
  }

  // Store the firewall VPN connections as outputs
  new CfnFirewallVpnConnectionOutput(scope, `FirewallVpnConnections${firewallConfig.name}`, vpnConnections);

  new CfnTgwVpnAttachmentsOutput(scope, `TgwVpnAttachments${firewallConfig.name}`, {
    name: firewallCgwName,
    attachments: tgwAttachments,
  });
}
