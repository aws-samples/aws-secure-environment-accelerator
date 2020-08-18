// tslint:disable:no-any
import 'jest';
import * as cdk from '@aws-cdk/core';
import { TransitGateway } from '@aws-accelerator/cdk-constructs/src/vpc';
import { resourcesToList, stackToCloudFormation } from '../jest';

test('the TransitGateway creation should create Transit Gateway with appropriate configurations', () => {
  const stack = new cdk.Stack();

  const transitGateway = new TransitGateway(stack, 'SharedNetwork', {
    name: 'Main',
    asn: 64512,
    dnsSupport: true,
    vpnEcmpSupport: true,
    defaultRouteTableAssociation: false,
    defaultRouteTablePropagation: false,
    autoAcceptSharedAttachments: false,
  });
  transitGateway.addRouteTable('core');
  transitGateway.addRouteTable('segregated');
  transitGateway.addRouteTable('shared');
  transitGateway.addRouteTable('standalone');

  // Convert the stack to a CloudFormation template
  const template = stackToCloudFormation(stack);
  const resources = resourcesToList(template.Resources);

  const resource = resources.filter(r => r.Type === 'AWS::EC2::TransitGateway');
  expect(resource).toHaveLength(1);

  const routeTables = resources.filter(r => r.Type === 'AWS::EC2::TransitGatewayRouteTable');
  expect(routeTables).toHaveLength(4);

  // Check config of Transit Gateway
  expect(resource).toEqual(
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
          Tags: [
            {
              Key: 'Name',
              Value: 'Main_tgw',
            },
          ],
        }),
      }),
    ]),
  );
});
