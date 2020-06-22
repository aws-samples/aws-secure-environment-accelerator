// tslint:disable:no-any
import 'jest';
import * as cdk from '@aws-cdk/core';
import { parse } from '@aws-pbmm/common-types';
import { TgwDeploymentConfigType } from '@aws-pbmm/common-lambda/lib/config';
import { resourcesToList, stackToCloudFormation } from '../jest';
import { TransitGateway } from '../../src/common/transit-gateway';

test('the TransitGateway creation should create Transit Gateway with appropriate configurations', () => {
  const stack = new cdk.Stack();

  new TransitGateway(
    stack,
    'SharedNetwork',
    parse(TgwDeploymentConfigType, {
      name: 'Main',
      asn: 64512,
      region: 'ca-central-1',
      features: {
        'DNS-support': true,
        'VPN-ECMP-support': true,
        'Default-route-table-association': false,
        'Default-route-table-propagation': false,
        'Auto-accept-sharing-attachments': false,
      },
      'route-tables': ['core', 'segregated', 'shared', 'standalone'],
    }),
  );

  // Convert the stack to a CloudFormation template
  const template = stackToCloudFormation(stack);
  const resources = resourcesToList(template.Resources);

  const tgw = resources.filter(r => r.Type === 'AWS::EC2::TransitGateway');
  const tgwRoutes = resources.filter(r => r.Type === 'AWS::EC2::TransitGatewayRouteTable');

  // There should only be one internet gateway
  expect(tgw).toHaveLength(1);
  expect(tgwRoutes).toHaveLength(4);

  // Check config of Transit Gateway
  expect(tgw).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        Type: 'AWS::EC2::TransitGateway',
        Properties: expect.objectContaining({
          AmazonSideAsn: 64512,
          AutoAcceptSharedAttachments: 'disable',
          DefaultRouteTableAssociation: 'disable',
          DefaultRouteTablePropagation: 'disable',
          DnsSupport: 'enable',
          VpnEcmpSupport: 'enable',
        }),
      }),
    ]),
  );
});
