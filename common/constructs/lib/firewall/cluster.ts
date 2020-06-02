import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { Keypair } from '@custom-resources/ec2-keypair';
import { FirewallInstance, FirewallConfigurationProps } from './instance';

export type FirewallClusterConfigurationProps = Omit<FirewallConfigurationProps, 'configPath'>;

export interface FirewallClusterProps {
  vpcCidrBlock: string;
  imageId: string;
  instanceType: string;
  roleName?: string;
  configuration: FirewallClusterConfigurationProps;
}

export class FirewallCluster extends cdk.Construct {
  private readonly props: FirewallClusterProps;

  readonly instances: FirewallInstance[] = [];
  readonly instanceRole: iam.Role;
  readonly instanceProfile: iam.CfnInstanceProfile;
  readonly keyPairName: string;
  readonly keyPair: Keypair;

  constructor(scope: cdk.Construct, id: string, props: FirewallClusterProps) {
    super(scope, id);

    this.props = props;

    this.instanceRole = new iam.Role(this, 'InstanceRole', {
      roleName: props.roleName,
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
        ],
        resources: ['*'],
      }),
    );
    this.instanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      path: '/',
      roles: [this.instanceRole.roleName],
    });

    this.keyPairName = 'Firewall';
    this.keyPair = new Keypair(this, 'KeyPair', {
      name: this.keyPairName,
      secretPrefix: 'accelerator/keypairs/',
    });

    this.props.configuration.bucket.grantRead(this.instanceRole);
  }

  createInstance(props: { name: string; hostname: string }): FirewallInstance {
    const { name, hostname } = props;

    const index = this.instances.length;
    const instance = new FirewallInstance(this, `Instance${index}`, {
      name,
      hostname,
      vpcCidrBlock: this.props.vpcCidrBlock,
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      iamInstanceProfile: this.instanceProfile,
      keyPair: this.keyPairName,
      configuration: {
        ...this.props.configuration,
        configPath: `fgtconfig-init-${hostname}-${index}.txt`,
      },
    });
    instance.node.addDependency(this.keyPair);

    this.instances.push(instance);
    return instance;
  }
}
