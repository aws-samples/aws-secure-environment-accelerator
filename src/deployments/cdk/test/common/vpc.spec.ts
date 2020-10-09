// eslint-disable-next-line @typescript-eslint/no-explicit-any
import 'jest';
import * as cdk from '@aws-cdk/core';
import { parse } from '@aws-accelerator/common-types';
import { VpcConfigType } from '@aws-accelerator/common-config';
import { resourcesToList, stackToCloudFormation } from '../jest';
import { Vpc } from '../../src/common/vpc';
import { Limiter } from '../../src/utils/limits';
import { AccountStacks } from '../../src/common/account-stacks';

const testStacks = new AccountStacks({
  phase: 'test',
  accounts: [],
  context: {
    acceleratorBaseline: 'LANDING_ZONE',
    acceleratorExecutionRoleName: 'test',
    acceleratorName: 'test',
    acceleratorPipelineRoleName: 'test',
    acceleratorPrefix: 'test',
    acceleratorStateMachineName: 'test',
    configBranch: 'master',
    configCommitId: 'test',
    configFilePath: 'raw/config.json',
    configRepositoryName: 'repo',
    defaultRegion: 'test',
    configRootFilePath: 'config.json',
    installerVersion: '0.0.0',
  },
});

test('the VPC creation should create the correct amount of subnets', () => {
  const stack = new cdk.Stack();

  const vpcConfig = parse(VpcConfigType, {
    name: 'shared-network',
    cidr: '10.2.0.0/16',
    region: 'ca-central-1',
    deploy: 'local',
    igw: false,
    vgw: false,
    pcx: false,
    natgw: false,
    'flow-logs': 'NONE',
    'gateway-endpoints': ['s3', 'dynamodb'],
    subnets: [
      {
        name: 'TGW',
        'share-to-ou-accounts': false,
        definitions: [
          {
            az: 'a',
            'route-table': 'DevVPC_Common',
            cidr: '10.2.88.0/27',
          },
          {
            az: 'b',
            'route-table': 'DevVPC_Common',
            cidr: '10.2.88.32/27',
          },
          {
            az: 'd',
            'route-table': 'DevVPC_Common',
            cidr: '10.2.88.64/27',
            disabled: true,
          },
        ],
      },
      {
        name: 'Web',
        'share-to-ou-accounts': false,
        definitions: [
          {
            az: 'a',
            'route-table': 'DevVPC_Common',
            cidr: '10.2.32.0/20',
          },
          {
            az: 'b',
            'route-table': 'DevVPC_Common',
            cidr: '10.2.128.0/20',
          },
          {
            az: 'd',
            'route-table': 'DevVPC_Common',
            cidr: '10.2.192.0/20',
            disabled: true,
          },
        ],
      },
    ],
    'route-tables': [
      {
        name: 'default',
      },
      {
        name: 'DevVPC_Common',
        routes: [
          {
            destination: '0.0.0.0/0',
            target: 'TGW',
          },
          {
            destination: 's3',
            target: 's3',
          },
          {
            destination: 'DynamoDB',
            target: 'DynamoDB',
          },
        ],
      },
    ],
  });
  new Vpc(stack, 'SharedNetwork', {
    accountKey: 'master',
    accounts: [],
    vpcConfig,
    limiter: new Limiter([]),
    accountStacks: testStacks,
    outputs: [],
    acceleratorName: 'test',
    installerVersion: '0.0.0',
  });

  // Convert the stack to a CloudFormation template
  const template = stackToCloudFormation(stack);
  const resources = resourcesToList(template.Resources);

  // The VPC Should have the correct CIDR block
  expect(resources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        Type: 'AWS::EC2::VPC',
        Properties: expect.objectContaining({
          CidrBlock: '10.2.0.0/16',
        }),
      }),
    ]),
  );

  const vpc = resources.find(r => r.Type === 'AWS::EC2::VPC')!!;
  const subnets = resources.filter(r => r.Type === 'AWS::EC2::Subnet');

  // There should be 4 subnets as 2 of the 6 given subnets are disabled
  expect(subnets).toHaveLength(4);

  expect(subnets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        Type: 'AWS::EC2::Subnet',
        Properties: expect.objectContaining({
          CidrBlock: '10.2.88.0/27',
          AvailabilityZone: 'ca-central-1a',
          VpcId: {
            Ref: vpc.LogicalId,
          },
        }),
      }),
      expect.objectContaining({
        Type: 'AWS::EC2::Subnet',
        Properties: expect.objectContaining({
          CidrBlock: '10.2.88.32/27',
          AvailabilityZone: 'ca-central-1b',
          VpcId: {
            Ref: vpc.LogicalId,
          },
        }),
      }),
      expect.objectContaining({
        Type: 'AWS::EC2::Subnet',
        Properties: expect.objectContaining({
          CidrBlock: '10.2.32.0/20',
          AvailabilityZone: 'ca-central-1a',
          VpcId: {
            Ref: vpc.LogicalId,
          },
        }),
      }),
      expect.objectContaining({
        Type: 'AWS::EC2::Subnet',
        Properties: expect.objectContaining({
          CidrBlock: '10.2.128.0/20',
          AvailabilityZone: 'ca-central-1b',
          VpcId: {
            Ref: vpc.LogicalId,
          },
        }),
      }),
    ]),
  );

  const routeTables = resources.filter(r => r.Type === 'AWS::EC2::RouteTable');
  const associations = resources.filter(r => r.Type === 'AWS::EC2::SubnetRouteTableAssociation');

  // There's a single route table
  expect(routeTables).toHaveLength(1);

  // The route table is associated with all the subnets
  expect(associations).toHaveLength(4);

  const vpcEndpoints = resources.filter(r => r.Type === 'AWS::EC2::VPCEndpoint');

  // The VPCEndpoints Endpoints count is 2
  expect(vpcEndpoints).toHaveLength(2);
});

test('the VPC creation should throw an error when a subnet uses a route table that does not exist', () => {
  const stack = new cdk.Stack();

  const vpcConfig = parse(VpcConfigType, {
    name: 'shared-network',
    cidr: '10.2.0.0/16',
    region: 'ca-central-1',
    deploy: 'local',
    igw: false,
    vgw: false,
    pcx: false,
    natgw: false,
    'flow-logs': 'NONE',
    subnets: [
      {
        name: 'TGW',
        'share-to-ou-accounts': false,
        definitions: [
          {
            az: 'a',
            'route-table': 'DevVPC_Common',
            cidr: '10.2.88.0/27',
          },
        ],
      },
    ],
  });
  expect(() => {
    new Vpc(stack, 'SharedNetwork', {
      accountKey: 'master',
      accounts: [],
      vpcConfig,
      limiter: new Limiter([]),
      accountStacks: testStacks,
      outputs: [],
      acceleratorName: 'test',
      installerVersion: '0.0.0',
    });
  });
});

test('the VPC creation should create the internet gateway', () => {
  const stack = new cdk.Stack();

  const vpcConfig = parse(VpcConfigType, {
    name: 'shared-network',
    cidr: '10.2.0.0/16',
    region: 'ca-central-1',
    deploy: 'local',
    igw: true,
    vgw: false,
    pcx: false,
    natgw: false,
    'flow-logs': 'NONE',
    subnets: [],
  });
  new Vpc(stack, 'SharedNetwork', {
    accountKey: 'master',
    accounts: [],
    vpcConfig,
    limiter: new Limiter([]),
    accountStacks: testStacks,
    outputs: [],
    acceleratorName: 'test',
    installerVersion: '0.0.0',
  });

  // Convert the stack to a CloudFormation template
  const template = stackToCloudFormation(stack);
  const resources = resourcesToList(template.Resources);

  const internetGateways = resources.filter(r => r.Type === 'AWS::EC2::InternetGateway');

  // There should only be one internet gateway
  expect(internetGateways).toHaveLength(1);
});

test('the VPC creation should create the VPN gateway', () => {
  const stack = new cdk.Stack();

  const vpcConfig = parse(VpcConfigType, {
    name: 'shared-network',
    cidr: '10.2.0.0/16',
    region: 'ca-central-1',
    deploy: 'local',
    igw: false,
    vgw: true,
    pcx: false,
    natgw: false,
    'flow-logs': 'NONE',
    subnets: [],
  });
  new Vpc(stack, 'SharedNetwork', {
    accountKey: 'master',
    accounts: [],
    vpcConfig,
    limiter: new Limiter([]),
    accountStacks: testStacks,
    outputs: [],
    acceleratorName: 'test',
    installerVersion: '0.0.0',
  });

  // Convert the stack to a CloudFormation template
  const template = stackToCloudFormation(stack);
  const resources = resourcesToList(template.Resources);

  // There should only be one VPN gateway
  expect(resources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        Type: 'AWS::EC2::VPC',
      }),
      expect.objectContaining({
        Type: 'AWS::EC2::VPNGateway',
      }),
    ]),
  );

  const vpc = resources.find(r => r.Type === 'AWS::EC2::VPC')!!;
  const vpnGateway = resources.find(r => r.Type === 'AWS::EC2::VPNGateway')!!;

  // There should only be one VPN Gateway Attachment
  expect(resources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        Type: 'AWS::EC2::VPCGatewayAttachment',
        Properties: expect.objectContaining({
          VpcId: {
            Ref: vpc.LogicalId,
          },
          VpnGatewayId: {
            Ref: vpnGateway.LogicalId,
          },
        }),
      }),
    ]),
  );
});

test('the VPC creation should create the NAT gateway', () => {
  const stack = new cdk.Stack();

  const vpcConfig = parse(VpcConfigType, {
    name: 'shared-network',
    cidr: '10.2.0.0/16',
    region: 'ca-central-1',
    deploy: 'local',
    igw: true,
    vgw: false,
    pcx: false,
    'flow-logs': 'NONE',
    natgw: {
      subnet: {
        name: 'Public',
        az: 'a',
      },
    },
    'gateway-endpoints': ['s3', 'dynamodb'],
    subnets: [
      {
        name: 'Private',
        'share-to-ou-accounts': false,
        definitions: [
          {
            az: 'a',
            'route-table': 'Private',
            cidr: '10.2.88.0/27',
          },
          {
            az: 'b',
            'route-table': 'Private',
            cidr: '10.2.88.32/27',
          },
        ],
      },
      {
        name: 'Public',
        'share-to-ou-accounts': false,
        definitions: [
          {
            az: 'a',
            'route-table': 'Public',
            cidr: '10.2.32.0/20',
          },
          {
            az: 'b',
            'route-table': 'Public',
            cidr: '10.2.128.0/20',
          },
        ],
      },
    ],
    'route-tables': [
      {
        name: 'default',
      },
      {
        name: 'Public',
        routes: [
          {
            destination: '0.0.0.0/0',
            target: 'IGW',
          },
        ],
      },
      {
        name: 'Private',
      },
    ],
  });
  new Vpc(stack, 'SharedNetwork', {
    accountKey: 'master',
    accounts: [],
    vpcConfig,
    limiter: new Limiter([]),
    accountStacks: testStacks,
    outputs: [],
    acceleratorName: 'test',
    installerVersion: '0.0.0',
  });

  // Convert the stack to a CloudFormation template
  const template = stackToCloudFormation(stack);
  const resources = resourcesToList(template.Resources);

  // There should be only on EIP Created
  const eip = resources.filter(r => r.Type === 'AWS::EC2::EIP');
  expect(eip).toHaveLength(1);

  // There should NAT Gatewsy Created
  const natGateways = resources.filter(r => r.Type === 'AWS::EC2::NatGateway');
  expect(natGateways).toHaveLength(1);

  // Route Tables
  const routeTables = resources.filter(r => r.Type === 'AWS::EC2::RouteTable');

  const privateRoute = routeTables.find(x => x.LogicalId.startsWith('SharedNetworkPrivate'));
  const routes = resources.filter(r => r.Type === 'AWS::EC2::Route');
  const natRoute = routes.find(x => x.Properties.NatGatewayId!! !== undefined);

  // Check NAT Gateway Route is assigned to Private Route Table which doesn't have IGW assigned
  expect(routes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        Type: 'AWS::EC2::Route',
        Properties: expect.objectContaining({
          RouteTableId: {
            Ref: privateRoute!!.LogicalId,
          },
          NatGatewayId: {
            Ref: natGateways[0].LogicalId,
          },
        }),
      }),
    ]),
  );
});
