import { IPv4CidrRange } from 'ip-num';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { Subnet, SecurityGroup } from '../vpc';
import { FirewallConfigParameters, FirewallConfig } from './config';

export interface FirewallInstanceProps {
  vpcCidr: string;
  hostname: string;
  /**
   * Image ID of firewall.
   */
  imageId: string;
  instanceType: string;
  iamInstanceProfileName: string;
  keyPairName: string;
}

export class FirewallInstance extends cdk.Construct {
  private readonly props: FirewallInstanceProps;
  private readonly configParameters: FirewallConfigParameters;
  private readonly networkInterfaces: ec2.CfnNetworkInterface[] = [];

  constructor(scope: cdk.Construct, id: string, props: FirewallInstanceProps) {
    super(scope, id);

    this.props = props;
    this.configParameters = {
      Hostname: props.hostname,
      VPCCIDR: props.vpcCidr,
    };
  }

  addPort(props: { securityGroup: SecurityGroup; subnet: Subnet; ipCidr: string; eipAllocationId?: string }) {
    const { securityGroup, subnet, ipCidr, eipAllocationId } = props;
    const index = this.networkInterfaces.length;

    // Get IP address IP CIDR
    const ipAddress = cdk.Fn.select(0, cdk.Fn.split('/', ipCidr));

    // Create network interface
    const networkInterface = new ec2.CfnNetworkInterface(this, `Eni${index}`, {
      groupSet: [securityGroup.id],
      subnetId: subnet.id,
      sourceDestCheck: false,
      privateIpAddresses: [
        {
          privateIpAddress: ipAddress,
          primary: true,
        },
      ],
    });
    this.networkInterfaces.push(networkInterface);

    // Create EIP if needed
    if (eipAllocationId) {
      new ec2.CfnEIPAssociation(this, `ClusterEipAssoc${index}`, {
        networkInterfaceId: networkInterface.ref,
        allocationId: eipAllocationId,
        privateIpAddress: ipAddress,
      });
    }

    // Store the IP and router IP in parameters
    this.configParameters[`Port${index + 1}IP`] = ipCidr;
    this.configParameters[`Port${index + 1}RouterIP`] = getFirstIp(subnet.cidrBlock);
  }

  protected onPrepare() {
    const config = new FirewallConfig(this, 'Config', {
      parameters: this.configParameters,
    });

    new ec2.CfnInstance(this, 'Resource', {
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      iamInstanceProfile: this.props.iamInstanceProfileName,
      keyName: this.props.keyPairName,
      networkInterfaces: this.networkInterfaces.map((eni, index) => ({
        deviceIndex: `${index}`,
        networkInterfaceId: eni.ref,
      })),
      userData: toBase64(JSON.stringify({
        bucket: config.bucketArn,
        region: config.bucketRegion,
        config: config.configPath,
        license: config.licensePath,
      })),
    });
  }
}

function toBase64(str: string): string {
  return Buffer.from(str).toString('base64');
}

function getFirstIp(cidrBlock: string) {
  const range = IPv4CidrRange.fromCidr(cidrBlock);
  const firstIp = range.getFirst();
  return firstIp.toString();
}
