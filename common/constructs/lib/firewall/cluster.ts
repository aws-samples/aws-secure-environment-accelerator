import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { KeyPair } from 'cdk-ec2-key-pair';
import { FirewallInstance } from './instance';

export interface FirewallClusterProps {
  vpcCidrBlock: string;
  imageId: string;
  instanceType: string;
}

export class FirewallCluster extends cdk.Construct {
  private readonly props: FirewallClusterProps;
  private readonly instances: FirewallInstance[] = [];
  private readonly instanceRole: iam.Role;
  private readonly instanceProfile: iam.CfnInstanceProfile;
  private readonly keyPairName: string;
  private readonly keyPair: KeyPair;

  constructor(scope: cdk.Construct, id: string, props: FirewallClusterProps) {
    super(scope, id);

    this.props = props;

    this.instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    this.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:Describe*',
          'ec2:AssociateAddress',
          'ec2:AssignPrivateIpAddresses',
          'ec2:UnassignPrivateIpAddresses',
          'ec2:ReplaceRoute',
          's3:GetObject',
        ],
        resources: ['*'],
      }),
    );
    this.instanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      path: '/',
      roles: [this.instanceRole.roleName],
    });

    this.keyPairName = 'FirewallKey';
    this.keyPair = new KeyPair(this, 'KeyPair', {
      name: this.keyPairName,
      secretPrefix: 'accelerator/keypairs',
    });
  }

  createInstance(hostname: string): FirewallInstance {
    const index = this.instances.length;
    const instance = new FirewallInstance(this, `Instance${index}`, {
      hostname,
      vpcCidr: this.props.vpcCidrBlock,
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      keyPairName: this.keyPairName,
      iamInstanceProfileName: this.instanceProfile.instanceProfileName!,
    });
    this.instances.push(instance);
    return instance;
  }
}
