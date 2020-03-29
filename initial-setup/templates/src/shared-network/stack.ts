import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export namespace SharedNetwork {
  export interface StackProps extends cdk.StackProps {
    region: 'us-east' | 'ca-central';
    cidr: string;
    subnets: SubnetProps[];
  }

  export interface SubnetProps {
    name: string;
    availabilityZone: '1a' | '1b' | '1c';
    cidr: string;
  }

  export class Stack extends cdk.Stack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);

      new TransitGateway(this, 'TransitGateway', props);
    }
  }

  export class TransitGateway extends cdk.Construct {
    constructor(scope: cdk.Construct, name: string, props: SharedNetwork.StackProps) {
      super(scope, name);

      const vpc = new ec2.CfnVPC(this, 'Vpc', {
        cidrBlock: props.cidr,
      });

      for (const subnetProps of props.subnets) {
        const subnet = new ec2.CfnSubnet(this, `Subnet${subnetProps.name}`, {
          vpcId: vpc.ref,
          availabilityZone: `${props.region}-${subnetProps.availabilityZone}`,
          cidrBlock: subnetProps.cidr,
        });
      }
    }
  }
}
