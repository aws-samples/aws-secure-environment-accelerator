/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

// Subnets in ASEA are named as ${subnetName}_${vpcName}_az${subnetDefinition.az}_net
export const createSubnetName = (vpcName: string, subnetName: string, az: string) =>
  `${subnetName}_${vpcName}_az${az}_net`;

export const createNatGatewayName = (subnetName: string, az: string) => `NATGW_${subnetName}_${az}_natgw`;

export const createNaclName = (vpcName: string, subnetName: string) => `${subnetName}_${vpcName}_nacl`;

export const vpcCidrsTableName = (accelPrefix: string) => `${accelPrefix}cidr-vpc-assign`;

export const subnetsCidrsTableName = (accelPrefix: string) => `${accelPrefix}cidr-subnet-assign`;

export const createTgwAttachName = (vpcName: string, tgwName: string) => `${vpcName}_${tgwName}_att`;

export const createVpcName = (vpcName: string, suffix?: string) => `${vpcName}_vpc${suffix || ''}`;

export const nfwRouteName = (routeTableName: string, destination: string) =>
  destination === '0.0.0.0/0' ? `${routeTableName}_nfw_route` : `${routeTableName}_nfw_${destination}_route`;

export const transitGatewayName = (name: string) => `${name}_tgw`;

export const transitGatewayPeerName = (sourceTgw: string, targetTgw: string) => `${sourceTgw}_to${targetTgw}_peer`;

export const transitGatewayRouteTableName = (name: string, tgwName: string) =>
  `${transitGatewayName(tgwName)}_${name}_rt`;

export const peeringConnectionName = (source: string, target: string) => `${source}-${target}_pcx`;

export const securityGroupName = (name: string) => `${name}_sg`;

export const createRouteTableName = (name: string) => `${name}_rt`;

export const createNetworkFirewallPolicyName = (policyName: string, firewallName: string, prefix: string) =>
  `${prefix}${firewallName}-${policyName}`;

export const createNetworkFirewallName = (firewallName: string, prefix: string) => `${prefix}${firewallName}`;

export const createNetworkFirewallRuleGroupName = (groupName: string, firewallName: string, prefix: string) =>
  `${prefix}${firewallName}-${groupName}`;

export const createScpName = (accelPrefix: string, name: string) => `${accelPrefix}${name}`;

export const createSsmDocumentName = (accelPrefix: string, name: string) => `${accelPrefix}LZA-${name}`;

export const createConfigRuleName = (accelPrefix: string, name: string) => `${accelPrefix}LZA-${name}`;

export const createAlbName = (name: string, accountKey: string) => `${name}-${accountKey}-alb`;
