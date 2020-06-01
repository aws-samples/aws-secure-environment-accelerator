import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { Keypair } from '@custom-resources/ec2-keypair';
import { SecurityGroup, Subnet } from '../vpc';

export interface FirewallManagerProps {
  name: string;
  /**
   * Image ID of firewall.
   */
  imageId: string;
  instanceType: string;
}

export class FirewallManager extends cdk.Construct {
  private readonly props: FirewallManagerProps;
  private readonly resource: ec2.CfnInstance;
  private readonly keyPair: KeyPair;
  private readonly keyPairName: string;
  private readonly networkInterfacesProps: ec2.CfnInstance.NetworkInterfaceProperty[] = [];

  constructor(scope: cdk.Construct, id: string, props: FirewallManagerProps) {
    super(scope, id);

    this.props = props;

    this.keyPairName = 'FirewallManagement';
    this.keyPair = new Keypair(this, 'KeyPair', {
      name: this.keyPairName,
      secretPrefix: 'accelerator/keypairs/',
    });

    this.resource = new ec2.CfnInstance(this, 'Resource', {
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      keyName: this.keyPairName,
      networkInterfaces: this.networkInterfacesProps,
    });
    cdk.Tag.add(this.resource, 'Name', this.props.name);

    this.resource.node.addDependency(this.keyPair);
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
