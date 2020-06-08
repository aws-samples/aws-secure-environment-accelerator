import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';

export interface Ec2InstanceProps {
  imageId: string;
  instanceType: string;
  subnetId: string;
}

export class Ec2Instance extends cdk.Construct {
  private readonly resource: ec2.CfnInstance;

  constructor(scope: cdk.Construct, id: string, props: Ec2InstanceProps) {
    super(scope, id);

    const { imageId, instanceType, subnetId } = props;

    this.resource = new ec2.CfnInstance(this, 'Instance', {
      imageId,
      instanceType,
      subnetId,
    });
  }

  get instanceId(): string {
    return `${this.resource.ref}`;
  }
}
