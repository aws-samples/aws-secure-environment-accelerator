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

import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import {
  TransitGatewayPeeringAttachmentOutputFinder,
  TransitGatewayOutputFinder,
  TransitGatewayPeeringAttachmentOutput,
  TransitGatewayOutput,
} from '@aws-accelerator/common-outputs/src/transit-gateway';
import { AccountStacks } from '../../common/account-stacks';
import { Account } from '../../utils/accounts';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as cdk from '@aws-cdk/core';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { TgwVpnAttachmentsOutputFinder } from '../firewall/cluster/outputs';

export interface TransitGatewayStep3Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  outputs: StackOutput[];
  config: AcceleratorConfig;
}

export async function step3(props: TransitGatewayStep3Props) {
  const { accountStacks, outputs, config } = props;

  const tgwPeeringAttachmentOutputs = TransitGatewayPeeringAttachmentOutputFinder.findAll({
    outputs,
  });

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const tgwConfigs = accountConfig.deployments?.tgw;
    if (!tgwConfigs || tgwConfigs.length === 0) {
      continue;
    }

    for (const tgwConfig of tgwConfigs) {
      const transitGateway = TransitGatewayOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        name: tgwConfig.name,
      });
      if (!transitGateway) {
        console.warn(`TGW not found "${accountKey}/${tgwConfig.name}"`);
        continue;
      }

      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, tgwConfig.region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey} in region ${tgwConfig.region}`);
        continue;
      }

      const tgwPeeringAttachment = tgwPeeringAttachmentOutputs.find(output => {
        const tgwPeer = output.tgws.find(tgw => tgw.name === tgwConfig.name && tgw.region === tgwConfig.region);
        return !!tgwPeer;
      });

      if (!tgwConfig['tgw-routes']) {
        continue;
      }

      for (const tgwRoute of tgwConfig['tgw-routes']) {
        if (!tgwRoute.routes) {
          continue;
        }

        for (const route of tgwRoute.routes) {
          if (route['target-tgw']) {
            if (!tgwPeeringAttachment) {
              console.warn(`No Peering Attachment found for "${tgwConfig.name}"`);
              continue;
            }
            CreateRoute({
              scope: accountStack,
              cidr: route.destination,
              routeName: tgwRoute.name,
              transitGateway,
              attachmentId: tgwPeeringAttachment.tgwAttachmentId,
              blackhole: route['blackhole-route'],
            });
          } else if (route['target-vpc']) {
            const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
              outputs,
              accountKey: route['target-account'] || accountKey,
              region: tgwConfig.region,
              vpcName: route['target-vpc'],
            });
            if (!vpcOutput) {
              console.warn(`Cannot find VPC "${route['target-vpc']}" in outputs`);
              continue;
            }
            const tgwAttachmentIds = vpcOutput.tgwAttachments.map(t => t.id);
            CreateRoutes({
              scope: accountStack,
              cidr: route.destination,
              routeName: tgwRoute.name,
              transitGateway,
              attachmentIds: tgwAttachmentIds,
              blackhole: route['blackhole-route'],
            });
          } else if (route['target-vpn']) {
            const vpnAttachments = TgwVpnAttachmentsOutputFinder.tryFindOneByName({
              outputs,
              accountKey,
              name: route['target-vpn'].name,
              region: tgwConfig.region,
            });
            if (!vpnAttachments) {
              console.warn(`Cannot find VPN "${route['target-vpn']}" in outputs`);
              continue;
            }
            const tgwAttachmentId = vpnAttachments.attachments.find(
              t => t.az === route['target-vpn']?.az && t.subnet === route['target-vpn']?.subnet,
            )?.id;
            if (!tgwAttachmentId) {
              continue;
            }
            CreateRoutes({
              scope: accountStack,
              cidr: route.destination,
              routeName: tgwRoute.name,
              transitGateway,
              attachmentIds: [tgwAttachmentId],
              blackhole: route['blackhole-route'],
            });
          } else if (route['blackhole-route']) {
            CreateRoute({
              scope: accountStack,
              cidr: route.destination,
              routeName: tgwRoute.name,
              transitGateway,
              blackhole: route['blackhole-route'],
            });
          }
        }
      }

      const tgwAttachConfig = tgwConfig['tgw-attach'];
      if (!tgwAttachConfig) {
        continue;
      }

      if (!tgwPeeringAttachment) {
        console.warn(
          `No Peering Attachment found for "${accountKey}/${tgwConfig.name}". Skipping Create associations fot tgw-attach`,
        );
        continue;
      }

      CreateAssociations(
        accountStacks,
        tgwPeeringAttachment,
        tgwConfig.region,
        accountKey,
        transitGateway,
        tgwAttachConfig['tgw-rt-associate-local'],
      );

      const transitGatewayRemote = TransitGatewayOutputFinder.tryFindOneByName({
        outputs,
        accountKey: tgwAttachConfig.account,
        name: tgwAttachConfig['associate-to-tgw'],
      });
      if (!transitGatewayRemote) {
        continue;
      }

      CreateAssociations(
        accountStacks,
        tgwPeeringAttachment,
        tgwAttachConfig.region,
        tgwAttachConfig.account,
        transitGatewayRemote,
        tgwAttachConfig['tgw-rt-associate-remote'],
      );
    }
  }
}

function CreateRoutes(props: {
  scope: cdk.Construct;
  cidr: string;
  routeName: string;
  transitGateway: TransitGatewayOutput;
  attachmentIds?: string[];
  blackhole?: boolean;
}) {
  const { cidr, routeName, scope, transitGateway, attachmentIds, blackhole } = props;
  for (const attachmentId of attachmentIds || []) {
    CreateRoute({
      scope,
      cidr,
      routeName,
      transitGateway,
      attachmentId,
      blackhole,
    });
  }
}

function CreateRoute(props: {
  scope: cdk.Construct;
  cidr: string;
  routeName: string;
  transitGateway: TransitGatewayOutput;
  attachmentId?: string;
  blackhole?: boolean;
}) {
  const { cidr, routeName, scope, transitGateway, attachmentId, blackhole } = props;
  const routesMap = transitGateway.tgwRouteTableNameToIdMap;
  if (routeName === '{TGW_ALL}') {
    for (const key of Object.keys(routesMap)) {
      CreateTransitGatewayRoute({
        scope,
        name: key,
        routeId: routesMap[key],
        cidrBlock: cidr,
        blackhole,
        attachmentId,
      });
    }
  } else {
    const routeId = routesMap[routeName];
    CreateTransitGatewayRoute({
      scope,
      name: routeName,
      routeId,
      cidrBlock: cidr,
      attachmentId,
      blackhole,
    });
  }
}

function CreateAssociations(
  accountStacks: AccountStacks,
  tgwPeeringAttachment: TransitGatewayPeeringAttachmentOutput,
  region: string,
  accountKey: string,
  transitGateway: TransitGatewayOutput,
  routes: string[],
) {
  const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
  if (!accountStack) {
    console.warn(`Cannot find account stack ${accountKey} in region ${region}`);
    return;
  }

  for (const route of routes) {
    const routeId = transitGateway.tgwRouteTableNameToIdMap[route];
    const tgwPeeringAttachmentId = tgwPeeringAttachment.tgwAttachmentId;

    new ec2.CfnTransitGatewayRouteTableAssociation(accountStack, `tgw_associate_${route}`, {
      transitGatewayAttachmentId: tgwPeeringAttachmentId,
      transitGatewayRouteTableId: routeId,
    });
  }
}

function CreateTransitGatewayRoute(props: {
  scope: cdk.Construct;
  name: string;
  routeId: string;
  cidrBlock: string;
  attachmentId?: string;
  blackhole?: boolean;
}) {
  const { attachmentId, cidrBlock, name, routeId, scope, blackhole } = props;
  // TODO need to update the id by calculating the hash of the properties
  const id = `${name}${attachmentId}${routeId}${cidrBlock}${blackhole}`;
  if (!blackhole) {
    new ec2.CfnTransitGatewayRoute(scope, `tgw_route_${id}`, {
      transitGatewayAttachmentId: attachmentId,
      transitGatewayRouteTableId: routeId,
      destinationCidrBlock: cidrBlock,
    });
  } else {
    new ec2.CfnTransitGatewayRoute(scope, `tgw_blackhole_${id}`, {
      blackhole: true,
      transitGatewayRouteTableId: routeId,
      destinationCidrBlock: cidrBlock,
    });
  }
}
