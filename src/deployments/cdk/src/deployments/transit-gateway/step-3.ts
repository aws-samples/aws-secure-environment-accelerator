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

      const tgwPeeringAttachment = tgwPeeringAttachmentOutputs.find(output => {
        const tgwPeer = output.tgws.find(tgw => tgw.name === tgwConfig.name && tgw.region === tgwConfig.region);
        return !!tgwPeer;
      });
      console.log('tgwPeeringAttachment', tgwPeeringAttachment);
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
          if (route['target-tgw']) {
            CreatePeerRoutes(
              accountStacks,
              route,
              tgwRoute.name,
              tgwPeeringAttachment,
              tgwConfig,
              accountKey,
              transitGateway,
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

function CreatePeerRoutes(
  accountStacks: AccountStacks,
  route: TransitGatewayRouteConfig,
  routeName: string,
  tgwPeeringAttachment: TransitGatewayPeeringAttachmentOutput,
  tgwConfig: TgwDeploymentConfig,
  accountKey: string,
  transitGateway: TransitGatewayOutput,
) {
  const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, tgwConfig.region);
  if (!accountStack) {
    console.warn(`Cannot find account stack ${accountKey} in region ${tgwConfig.region}`);
    return;
  }

  const routesMap = transitGateway.tgwRouteTableNameToIdMap;
  if (routeName === '{TGW_ALL}') {
    console.log('tgwRouteTableNameToIdMap', routesMap);
    for (const key in routesMap) {
      CreateTransitGatewayRoute(
        accountStack,
        key,
        tgwPeeringAttachment.tgwAttachmentId,
        routesMap[key],
        route.destination,
      );
    }
  } else {
    const routeId = routesMap[routeName];
    console.log('route name', 'tgwRouteTableNameToIdMap routeId', routeName, routeId);
    CreateTransitGatewayRoute(
      accountStack,
      routeName,
      tgwPeeringAttachment.tgwAttachmentId,
      routeId,
      route.destination,
    );
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
  for (const route of routes) {
    const routeId = transitGateway.tgwRouteTableNameToIdMap[route];
    const tgwPeeringAttachmentId = tgwPeeringAttachment.tgwAttachmentId;

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey} in region ${region}`);
      continue;
    }

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
) {
  new ec2.CfnTransitGatewayRoute(scope, `tgw_route_${name}`, {
    transitGatewayAttachmentId: attachmentId,
    transitGatewayRouteTableId: routeId,
    destinationCidrBlock: cidrBlock,
  });
}
