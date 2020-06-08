import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { FirewallInstance, FirewallConfigurationProps } from './instance';

export type FirewallClusterConfigurationProps = Omit<FirewallConfigurationProps, 'configPath'>;

export interface FirewallClusterProps {
  vpcCidrBlock: string;
  imageId: string;
  instanceType: string;
  roleName?: string;
  keyPairName?: string;
  configuration: FirewallClusterConfigurationProps;
}

export class FirewallCluster extends cdk.Construct {
  private readonly props: FirewallClusterProps;

  readonly instances: FirewallInstance[] = [];
  readonly instanceRole: iam.Role;
  readonly instanceProfile: iam.CfnInstanceProfile;

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

    this.props.configuration.bucket.grantRead(this.instanceRole);
  }

  createInstance(props: {
    name: string;
    hostname: string;
    licensePath?: string;
    licenseBucket?: s3.IBucket;
  }): FirewallInstance {
    const { name, hostname, licensePath, licenseBucket } = props;

    const index = this.instances.length;
    const instance = new FirewallInstance(this, `Instance${index}`, {
      name,
      hostname,
      licensePath,
      licenseBucket,
      vpcCidrBlock: this.props.vpcCidrBlock,
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      iamInstanceProfile: this.instanceProfile,
      keyPairName: this.props.keyPairName,
      configuration: {
        ...this.props.configuration,
        configPath: `fgtconfig-init-${hostname}-${index}.txt`,
      },
    });

    this.instances.push(instance);
    return instance;
  }
}
