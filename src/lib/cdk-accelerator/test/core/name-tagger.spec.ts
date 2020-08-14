import 'jest';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { expect, haveResource, haveResourceLike } from '@aws-cdk/assert';
import { AcceleratorNameTagger } from '../../src/core';

test('should add the Name tag with the correct suffix to ec2.Vpc', () => {
  const stack = new cdk.Stack();

  new ec2.Vpc(stack, 'SharedNetwork', {
    cidr: '10.0.0.1/24',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  // Make sure the aspects get applied
  cdk.ConstructNode.prepare(stack.node);

  expect(stack).to(
    haveResource('AWS::EC2::VPC', {
      Tags: [
        {
          Key: 'Name',
          Value: 'SharedNetwork_vpc',
        },
      ],
    }),
  );
});

test('should add the Name tag with the correct suffix to ec2.CfnVpc', () => {
  const stack = new cdk.Stack();

  new ec2.CfnVPC(stack, 'SharedNetwork', {
    cidrBlock: '10.0.0.1/24',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  // Make sure the aspects get applied
  cdk.ConstructNode.prepare(stack.node);

  expect(stack).to(
    haveResourceLike('AWS::EC2::VPC', {
      Tags: [
        {
          Key: 'Name',
          Value: 'SharedNetwork_vpc',
        },
      ],
    }),
  );
});

test('should add the Name tag with the correct suffix to ec2.Subnet', () => {
  const stack = new cdk.Stack();

  new ec2.Subnet(stack, 'Subnet1a', {
    vpcId: '1',
    cidrBlock: '10.0.0.1/24',
    availabilityZone: 'ca-central-1a',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  // Make sure the aspects get applied
  cdk.ConstructNode.prepare(stack.node);

  expect(stack).to(
    haveResourceLike('AWS::EC2::Subnet', {
      Tags: [
        {
          Key: 'Name',
          Value: 'Subnet1a_net',
        },
      ],
    }),
  );
});

test('should add the Name tag with the correct suffix to ec2.CfnSubnet', () => {
  const stack = new cdk.Stack();

  new ec2.CfnSubnet(stack, 'Subnet1a', {
    vpcId: '1',
    cidrBlock: '10.0.0.1/24',
    availabilityZone: 'ca-central-1a',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  // Make sure the aspects get applied
  cdk.ConstructNode.prepare(stack.node);

  expect(stack).to(
    haveResourceLike('AWS::EC2::Subnet', {
      Tags: [
        {
          Key: 'Name',
          Value: 'Subnet1a_net',
        },
      ],
    }),
  );
});

test('should add the Name tag with the correct suffix to ec2.CfnRouteTable', () => {
  const stack = new cdk.Stack();

  new ec2.CfnRouteTable(stack, 'RouteTable1', {
    vpcId: '1',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  // Make sure the aspects get applied
  cdk.ConstructNode.prepare(stack.node);

  expect(stack).to(
    haveResourceLike('AWS::EC2::RouteTable', {
      Tags: [
        {
          Key: 'Name',
          Value: 'RouteTable1_rt',
        },
      ],
    }),
  );
});

test('should add the Name tag with the correct suffix to ec2.CfnTransitGateway', () => {
  const stack = new cdk.Stack();

  new ec2.CfnTransitGateway(stack, 'Main', {});

  stack.node.applyAspect(new AcceleratorNameTagger());

  // Make sure the aspects get applied
  cdk.ConstructNode.prepare(stack.node);

  expect(stack).to(
    haveResourceLike('AWS::EC2::TransitGateway', {
      Tags: [
        {
          Key: 'Name',
          Value: 'Main_tgw',
        },
      ],
    }),
  );
});

test('should add the Name tag with the correct suffix to ec2.CfnTransitGatewayRouteTable', () => {
  const stack = new cdk.Stack();

  new ec2.CfnTransitGatewayRouteTable(stack, 'TgwRouteTable1', {
    transitGatewayId: '1',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  // Make sure the aspects get applied
  cdk.ConstructNode.prepare(stack.node);

  expect(stack).to(
    haveResourceLike('AWS::EC2::TransitGatewayRouteTable', {
      Tags: [
        {
          Key: 'Name',
          Value: 'TgwRouteTable1_rt',
        },
      ],
    }),
  );
});

test('should not add suffix if the suffix is already there', () => {
  const stack = new cdk.Stack();

  new ec2.Vpc(stack, 'SharedNetwork_vpc', {
    cidr: '10.0.0.1/24',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  // Make sure the aspects get applied
  cdk.ConstructNode.prepare(stack.node);

  expect(stack).to(
    haveResourceLike('AWS::EC2::VPC', {
      Tags: [
        {
          Key: 'Name',
          Value: 'SharedNetwork_vpc',
        },
      ],
    }),
  );
});
