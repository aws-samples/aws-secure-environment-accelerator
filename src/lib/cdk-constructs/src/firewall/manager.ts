import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { SecurityGroup, Subnet } from '../vpc';
import { CfnSleep } from '@aws-accelerator/custom-resource-cfn-sleep';

export interface FirewallManagerProps {
  name: string;
  /**
   * Image ID of firewall.
   */
  imageId: string;
  instanceType: string;
  blockDeviceMappings: ec2.CfnInstance.BlockDeviceMappingProperty[];
  keyPairName?: string;
  userData?: string;
  iamInstanceProfile?: string;
}

export class FirewallManager extends cdk.Construct {
  private readonly resource: ec2.CfnInstance;
  private readonly networkInterfacesProps: ec2.CfnInstance.NetworkInterfaceProperty[] = [];

  constructor(scope: cdk.Construct, id: string, private readonly props: FirewallManagerProps) {
    super(scope, id);

    this.resource = new ec2.CfnInstance(this, 'Resource', {
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      keyName: this.props.keyPairName,
      networkInterfaces: this.networkInterfacesProps,
      blockDeviceMappings: this.props.blockDeviceMappings,
      userData: this.props.userData ? cdk.Fn.base64(this.props.userData) : undefined,
      iamInstanceProfile: props.iamInstanceProfile,
    });
    cdk.Tags.of(this.resource).add('Name', this.props.name);
  }

  addNetworkInterface(props: { securityGroup: SecurityGroup; subnet: Subnet; eipAllocationId?: string }) {
    const { securityGroup, subnet, eipAllocationId } = props;
    const index = this.networkInterfacesProps.length;

    // Create network interface
    const networkInterface = new ec2.CfnNetworkInterface(this, `Eni${index}`, {
      groupSet: [securityGroup.id],
      subnetId: subnet.id,
    });
    this.networkInterfacesProps.push({
      deviceIndex: `${index}`,
      networkInterfaceId: networkInterface.ref,
    });

    // Create EIP if needed
    if (eipAllocationId) {
      const eipAssociation = new ec2.CfnEIPAssociation(this, `ClusterEipAssoc${index}`, {
        networkInterfaceId: networkInterface.ref,
        allocationId: eipAllocationId,
      });
      // Sleep 60 seconds after creation of the Ec2 instance
      const roleSleep = new CfnSleep(this, `ClusterEipAssocSleep${index}`, {
        sleep: 60 * 1000,
      });
      roleSleep.node.addDependency(this.resource);
      eipAssociation.node.addDependency(roleSleep);
    }
  }

  get instanceId() {
    return this.resource.ref;
  }
}
