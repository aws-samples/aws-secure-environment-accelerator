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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
