import { AcceleratorConfig, TgwDeploymentConfig, TransitGatewayRouteConfig } from '@aws-accelerator/common-config/src';
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
  if (tgwPeeringAttachmentOutputs.length === 0) {
    return;
  }

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
      if (!tgwPeeringAttachment) {
        continue;
      }

      if (!tgwConfig['tgw-routes']) {
        continue;
      }

      for (const tgwRoute of tgwConfig['tgw-routes']) {
        if (!tgwRoute.routes) {
          continue;
        }

        for (const route of tgwRoute.routes) {
          if (route['target-tgw'] || route['blackhole-route']) {
            CreateRoute(
              accountStack,
              route.destination,
              tgwRoute.name,
              tgwPeeringAttachment.tgwAttachmentId,
              transitGateway,
              route['blackhole-route'],
            );
          } else if (route['target-vpc']) {
            const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
              outputs,
              accountKey,
              region: tgwConfig.region,
              vpcName: route['target-vpc'],
            });
            if (!vpcOutput) {
              console.warn(`Cannot find VPC "${route['target-vpc']}" in outputs`);
              continue;
            }
            const tgwAttachmentIds = vpcOutput.tgwAttachments.map(t => t.id);
            CreateRoutes(
              accountStack,
              route.destination,
              tgwRoute.name,
              tgwAttachmentIds,
              transitGateway,
              route['blackhole-route'],
            );
          } else if (route['target-vpn']) {
            const vpnAttachments = TgwVpnAttachmentsOutputFinder.tryFindOneByName({
              outputs,
              accountKey,
              name: route['target-vpn'],
              region: tgwConfig.region,
            });
            if (!vpnAttachments) {
              console.warn(`Cannot find VPN "${route['target-vpn']}" in outputs`);
              continue;
            }
            const tgwAttachmentIds = vpnAttachments.attachments.map(t => t.id);
            CreateRoutes(
              accountStack,
              route.destination,
              tgwRoute.name,
              [tgwAttachmentIds[0]], // TODO static routes not allowing more than 1 attachment
              transitGateway,
              route['blackhole-route'],
            );
          }
        }
      }

      const tgwAttachConfig = tgwConfig['tgw-attach'];
      if (!tgwAttachConfig) {
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

function CreateRoutes(
  scope: cdk.Construct,
  cidr: string,
  routeName: string,
  attachmentIds: string[],
  transitGateway: TransitGatewayOutput,
  blackhole?: boolean,
) {
  for (const attachmentId of attachmentIds || []) {
    CreateRoute(scope, cidr, routeName, attachmentId, transitGateway, blackhole);
  }
}

function CreateRoute(
  scope: cdk.Construct,
  cidr: string,
  routeName: string,
  attachmentId: string,
  transitGateway: TransitGatewayOutput,
  blackhole?: boolean,
) {
  const routesMap = transitGateway.tgwRouteTableNameToIdMap;
  if (routeName === '{TGW_ALL}') {
    for (const key of Object.keys(routesMap)) {
      CreateTransitGatewayRoute(scope, key, attachmentId, routesMap[key], cidr, blackhole);
    }
  } else {
    const routeId = routesMap[routeName];
    CreateTransitGatewayRoute(scope, routeName, attachmentId, routeId, cidr, blackhole);
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

function CreateTransitGatewayRoute(
  scope: cdk.Construct,
  name: string,
  attachmentId: string,
  routeId: string,
  cidrBlock: string,
  blackhole?: boolean,
) {
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
