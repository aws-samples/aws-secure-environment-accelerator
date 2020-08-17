import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { IInstanceProfile } from '../iam';
import { FirewallInstance, FirewallConfigurationProps } from './instance';

export type FirewallClusterConfigurationProps = Omit<FirewallConfigurationProps, 'configPath'>;

export interface FirewallClusterProps {
  vpcCidrBlock: string;
  additionalCidrBlocks: string[];
  imageId: string;
  instanceType: string;
  instanceRole: iam.IRole;
  instanceProfile: IInstanceProfile;
  keyPairName?: string;
  configuration: FirewallClusterConfigurationProps;
}

export class FirewallCluster extends cdk.Construct {
  readonly instances: FirewallInstance[] = [];

  constructor(scope: cdk.Construct, id: string, private readonly props: FirewallClusterProps) {
    super(scope, id);
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
      additionalCidrBlocks: this.props.additionalCidrBlocks,
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      instanceProfile: this.props.instanceProfile,
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
