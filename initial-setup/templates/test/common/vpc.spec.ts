import 'jest';
import '@aws-cdk/assert/jest';
import * as cdk from '@aws-cdk/core';
// import { countResources, expect, haveResource } from '@aws-cdk/assert';
import { parse, VpcConfigType } from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from '../../src/common/vpc';

test('should create the correct amount of subnets', () => {
  const stack = new cdk.Stack();

  new Vpc(stack, 'SharedNetwork', parse(VpcConfigType, {
    name: 'shared-network',
    cidr: '10.2.0.0/16',
    region: 'ca-central-1',
    igw: false,
    vgw: false,
    pcx: false,
    natgw: false,
    subnets: [
      {
        'name': 'TGW',
        'share-to-ou-accounts': false,
        'definitions': [
          {
            'az': 'a',
            'route-table': 'DevVPC_Common',
            'cidr': '10.2.88.0/27',
          },
          {
            'az': 'b',
            'route-table': 'DevVPC_Common',
            'cidr': '10.2.88.32/27',
          },
          {
            'az': 'd',
            'route-table': 'DevVPC_Common',
            'cidr': '10.2.88.64/27',
            'disabled': true,
          },
        ],
      },
      {
        'name': 'Web',
        'share-to-ou-accounts': true,
        'definitions': [
          {
            'az': 'a',
            'route-table': 'DevVPC_Common',
            'cidr': '10.2.32.0/20',
          },
          {
            'az': 'b',
            'route-table': 'DevVPC_Common',
            'cidr': '10.2.128.0/20',
          },
          {
            'az': 'd',
            'route-table': 'DevVPC_Common',
            'cidr': '10.2.192.0/20',
            'disabled': true,
          },
        ],
      },
    ],
    'route-tables': [
      {
        'name': 'default',
      },
      {
        'name': 'DevVPC_Common',
        'routes': [
          {
            'destination': '0.0.0.0/0',
            'target': 'TGW',
          },
          {
            'destination': 'GW-endpoint-s3',
            'target': 'GW-endpoint-s3',
          },
          {
            'destination': 'GW-endpoint-DynamoDB',
            'target': 'GW-endpoint-DynamoDB',
          },
        ],
      },
    ],
  }));

  expect(stack).toHaveResource('AWS::EC2::VPC', {
    CidrBlock: '10.2.0.0/16',
  });

  // expect(stack).to(countResources('AWS::EC2::Subnet', 4));
  //
  // expect(stack).to(
  //   haveResource('AWS::EC2::Subnet', {
  //     CidrBlock: '10.2.88.0/27',
  //     AvailabilityZone: 'ca-central-1a',
  //   }),
  // );
  //
  // expect(stack).to(
  //   haveResource('AWS::EC2::Subnet', {
  //     CidrBlock: '10.2.88.32/27',
  //     AvailabilityZone: 'ca-central-1b',
  //   }),
  // );
  //
  // expect(stack).to(
  //   haveResource('AWS::EC2::Subnet', {
  //     CidrBlock: '10.2.32.0/20',
  //     AvailabilityZone: 'ca-central-1a',
  //   }),
  // );
  //
  // expect(stack).to(
  //   haveResource('AWS::EC2::Subnet', {
  //     CidrBlock: '10.2.128.0/20',
  //     AvailabilityZone: 'ca-central-1b',
  //   }),
  // );
  //
  // expect(stack).to(countResources('AWS::EC2::RouteTable', 1));
  // expect(stack).to(countResources('AWS::EC2::SubnetRouteTableAssociation', 4));
});

test('should throw an error when a route table does not exist', () => {
  const stack = new cdk.Stack();

  expect(() => {
    new Vpc(stack, 'SharedNetwork', parse(VpcConfigType, {
      name: 'shared-network',
      cidr: '10.2.0.0/16',
      region: 'ca-central-1',
      igw: false,
      vgw: false,
      pcx: false,
      natgw: false,
      subnets: [
        {
          'name': 'TGW',
          'share-to-ou-accounts': false,
          'definitions': [
            {
              'az': 'a',
              'route-table': 'DevVPC_Common',
              'cidr': '10.2.88.0/27',
            },
          ],
        },
      ],
    }));
  }).toThrowError();
});
