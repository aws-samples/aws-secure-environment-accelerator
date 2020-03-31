import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { expect, haveResource } from '@aws-cdk/assert';
import { AcceleratorNameTagger } from '../../lib/core';

test('should add the Name tag with the correct suffix to ec2.Vpc', () => {
  const stack = new cdk.Stack();

  new ec2.Vpc(stack, 'SharedNetwork', {
    cidr: '10.0.0.1/24',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  expect(stack).to(haveResource('AWS::EC2::VPC', {
    Tags: [{
      'Key': 'Name',
      'Value': 'SharedNetwork_vpc',
    }],
  }));
});

test('should add the Name tag with the correct suffix to ec2.CfnVpc', () => {
  const stack = new cdk.Stack();

  new ec2.CfnVPC(stack, 'SharedNetwork', {
    cidrBlock: '10.0.0.1/24',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  expect(stack).to(haveResource('AWS::EC2::VPC', {
    Tags: [{
      'Key': 'Name',
      'Value': 'SharedNetwork_vpc',
    }],
  }));
});

test('should add the Name tag with the correct suffix to ec2.Subnet', () => {
  const stack = new cdk.Stack();

  new ec2.Subnet(stack, 'Subnet1a', {
    vpcId: '1',
    cidrBlock: '10.0.0.1/24',
    availabilityZone: 'ca-central-1a',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  expect(stack).to(haveResource('AWS::EC2::Subnet', {
    Tags: [{
      'Key': 'Name',
      'Value': 'Subnet1a_net',
    }],
  }));
});

test('should add the Name tag with the correct suffix to ec2.CfnSubnet', () => {
  const stack = new cdk.Stack();

  new ec2.CfnSubnet(stack, 'Subnet1a', {
    vpcId: '1',
    cidrBlock: '10.0.0.1/24',
    availabilityZone: 'ca-central-1a',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  expect(stack).to(haveResource('AWS::EC2::Subnet', {
    Tags: [{
      'Key': 'Name',
      'Value': 'Subnet1a_net',
    }],
  }));
});

test('should not add suffix if the suffix is already there', () => {
  const stack = new cdk.Stack();

  new ec2.Vpc(stack, 'SharedNetwork_vpc', {
    cidr: '10.0.0.1/24',
  });

  stack.node.applyAspect(new AcceleratorNameTagger());

  expect(stack).to(haveResource('AWS::EC2::VPC', {
    Tags: [{
      'Key': 'Name',
      'Value': 'SharedNetwork_vpc',
    }],
  }));
});
