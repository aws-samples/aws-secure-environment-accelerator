import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { KeyPair } from 'cdk-ec2-key-pair';

export interface FirewallManagerProps {
  /**
   * Image ID of firewall.
   */
  imageId: string;
  instanceType: string;
  securityGroupIds: string[];
  subnetId: string;
}

export class FirewallManager extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: FirewallManagerProps) {
    super(scope, id);

    const keyPairName = 'FirewallManagementKey';
    new KeyPair(this, 'KeyPair', {
      name: keyPairName,
      secretPrefix: 'accelerator/keypairs/',
    });

    new ec2.CfnInstance(this, 'Resource', {
      imageId: props.imageId,
      instanceType: props.instanceType,
      securityGroupIds: props.securityGroupIds,
      subnetId: props.subnetId,
      keyName: keyPairName,
    });
  }
}
