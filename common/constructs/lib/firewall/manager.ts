import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { SecurityGroup, Subnet } from '../vpc';

export interface FirewallManagerProps {
  name: string;
  /**
   * Image ID of firewall.
   */
  imageId: string;
  instanceType: string;
  keyPairName?: string;
}

export class FirewallManager extends cdk.Construct {
  private readonly props: FirewallManagerProps;
  private readonly resource: ec2.CfnInstance;
  private readonly networkInterfacesProps: ec2.CfnInstance.NetworkInterfaceProperty[] = [];

  constructor(scope: cdk.Construct, id: string, props: FirewallManagerProps) {
    super(scope, id);

    this.props = props;

    this.resource = new ec2.CfnInstance(this, 'Resource', {
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      keyName: this.props.keyPairName,
      networkInterfaces: this.networkInterfacesProps,
    });
    cdk.Tag.add(this.resource, 'Name', this.props.name);
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
      new ec2.CfnEIPAssociation(this, `ClusterEipAssoc${index}`, {
        networkInterfaceId: networkInterface.ref,
        allocationId: eipAllocationId,
      });
    }
  }

  get instanceId() {
    return this.resource.ref;
  }
}
