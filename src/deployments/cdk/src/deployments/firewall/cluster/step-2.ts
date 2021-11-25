/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

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
      if (!firewallConfig.deploy || c.FirewallAutoScaleConfigType.is(firewallConfig)) {
        console.log(`Deploy set to false for "${firewallConfig.name}"`);
        continue;
      }
      const firewallPorts: FirewallPort[] = [];
      if (c.FirewallEC2ConfigType.is(firewallConfig)) {
        // Find the firewall EIPs in the firewall account
        const firewallPortOutputs = FirewallPortOutputFinder.findAll({
          outputs,
          accountKey,
          region: firewallConfig.region,
        });
        firewallPorts.push(...firewallPortOutputs.flatMap(array => array));
        if (firewallPorts.length === 0) {
          console.warn(`Cannot find firewall port outputs in account "${accountKey}"`);
          continue;
        }
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
 * Create customer gateway and VPN connections for the firewall EIPs of step 1 or customer provided ips from configuration file.
 */
async function createCustomerGateways(props: {
  scope: cdk.Construct;
  firewallAccountKey: string;
  firewallConfig: c.FirewallEC2ConfigType | c.FirewallCGWConfigType;
  transitGateway: TransitGatewayOutput;
  attachConfig: c.TransitGatewayAttachConfig;
  firewallPorts?: FirewallPort[];
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
  if (c.FirewallEC2ConfigType.is(firewallConfig)) {
    for (const [index, port] of Object.entries(firewallPorts || [])) {
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
          staticRoutesOnly: firewallCgwRouting === 'static' ? true : undefined,
        });

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

        const options = new VpnTunnelOptions(scope, `VpnTunnelOptions${index}`, {
          vpnConnectionId: vpnConnection.ref,
        });

        vpnTunnelOptions = {
          cgwTunnelInsideAddress1: options.getAttString('CgwInsideIpAddress1'),
          cgwTunnelOutsideAddress1: options.getAttString('CgwOutsideIpAddress1'),
          cgwBgpAsn1: firewallCgwRouting === 'dynamic' ? options.getAttString('CgwBgpAsn1') : undefined,
          vpnTunnelInsideAddress1: options.getAttString('VpnInsideIpAddress1'),
          vpnTunnelOutsideAddress1: options.getAttString('VpnOutsideIpAddress1'),
          vpnBgpAsn1: firewallCgwRouting === 'dynamic' ? options.getAttString('VpnBgpAsn1') : undefined,
          preSharedSecret1: options.getAttString('PreSharedKey1'),
          cgwTunnelInsideAddress2: options.getAttString('CgwInsideIpAddress2'),
          cgwTunnelOutsideAddress2: options.getAttString('CgwOutsideIpAddress2'),
          cgwBgpAsn2: firewallCgwRouting === 'dynamic' ? options.getAttString('CgwBgpAsn2') : undefined,
          vpnTunnelInsideAddress2: options.getAttString('VpnInsideIpAddress2'),
          vpnTunnelOutsideAddress2: options.getAttString('VpnOutsideIpAddress2'),
          vpnBgpAsn2: firewallCgwRouting === 'dynamic' ? options.getAttString('VpnBgpAsn2') : undefined,
          preSharedSecret2: options.getAttString('PreSharedKey2'),
        };

        tgwAttachments.push({
          subnet: port.subnetName,
          az: port.az,
          id: attachments.getTransitGatewayAttachmentId(0),
          index
        });
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
  } else {
    for (const [index, fwIp] of Object.entries(firewallConfig['fw-ips'] || [])) {
      const prefix = `${firewallCgwName}_ip${index}`;
      const customerGateway = new ec2.CfnCustomerGateway(scope, `${prefix}_cgw`, {
        type: 'ipsec.1',
        ipAddress: fwIp,
        bgpAsn: firewallCgwRouting === 'dynamic' ? firewallCgwAsn : 65000,
      });
      const vpnConnection = new ec2.CfnVPNConnection(scope, `${prefix}_vpn`, {
        type: 'ipsec.1',
        transitGatewayId: transitGateway.tgwId,
        customerGatewayId: customerGateway.ref,
        staticRoutesOnly: firewallCgwRouting === 'static' ? true : undefined,
      });
      // Creating VPN connection route table association and propagation
      const attachments = new VpnAttachments(scope, `VpnAttachments-${prefix}_attach`, {
        vpnConnectionId: vpnConnection.ref,
        tgwId: transitGateway.tgwId,
      });
      // Make sure to add the tags to the VPN attachments
      addTagsDependencies.push(attachments);
      const transitGatewayAttachmentId = attachments.getTransitGatewayAttachmentId(0); // one vpn connection should only have one attachment

      addTagsToResources.push({
        targetAccountIds: [cdk.Aws.ACCOUNT_ID],
        resourceId: transitGatewayAttachmentId,
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
          transitGatewayAttachmentId, 
          transitGatewayRouteTableId: route,
        });
      }

      for (const [routeIndex, route] of tgwRoutePropagates?.entries()) {
        new ec2.CfnTransitGatewayRouteTablePropagation(scope, `tgw_propagate_${prefix}_${routeIndex}`, {
          transitGatewayAttachmentId,
          transitGatewayRouteTableId: route,
        });
      }

      tgwAttachments.push({
        id: transitGatewayAttachmentId,
        index,
        az: undefined,
        subnet: undefined,
      });
    }
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
