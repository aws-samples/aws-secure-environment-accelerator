import * as fs from 'fs';
import * as tempy from 'tempy';
import { IPv4CidrRange } from 'ip-num';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3assets from '@aws-cdk/aws-s3-assets';
import { KeyPair } from 'cdk-ec2-key-pair';
import { Subnet, SecurityGroup } from '../vpc/vpc';

export interface FortiGateInstanceProps {
  vpcCidr: string;
  hostname: string;
  /**
   * Image ID of FortiGate.
   */
  imageId: string;
  instanceType: string;
  iamInstanceProfileArn: string;
  keyPairName: string;
}

export class FortiGateInstance extends cdk.Construct {
  private readonly props: FortiGateInstanceProps;
  private readonly configParameters: FortiGateConfigParameters;
  private readonly networkInterfaces: ec2.CfnNetworkInterface[] = [];

  constructor(scope: cdk.Construct, id: string, props: FortiGateInstanceProps) {
    super(scope, id);

    this.props = props;
    this.configParameters = {
      Hostname: props.hostname,
      VPCCIDR: props.vpcCidr,
    };
  }

  addPort(props: { securityGroup: SecurityGroup; subnet: Subnet; ipCidr: string; attachEip: boolean }) {
    const { securityGroup, subnet, ipCidr, attachEip } = props;
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
    if (attachEip) {
      const eip = new ec2.CfnEIP(this, `Eip${index}`, {
        domain: 'vpc',
      });
      new ec2.CfnEIPAssociation(this, `ClusterEipAssoc${index}`, {
        networkInterfaceId: networkInterface.ref,
        allocationId: eip.attrAllocationId,
        privateIpAddress: ipAddress,
      });
    }

    // Store the IP and router IP in parameters
    this.configParameters[`Port${index + 1}IP`] = ipCidr;
    this.configParameters[`Port${index + 1}RouterIP`] = getFirstIp(subnet.cidrBlock);
  }

  protected onPrepare() {
    const config = new FortiGateConfig(this, 'Config', {
      parameters: this.configParameters,
    });

    new ec2.CfnInstance(this, 'Resource', {
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      iamInstanceProfile: this.props.iamInstanceProfileArn,
      keyName: this.props.keyPairName,
      networkInterfaces: this.networkInterfaces.map((eni, index) => ({
        deviceIndex: `${index}`,
        networkInterfaceId: eni.ref,
      })),
      userData: JSON.stringify({
        bucket: config.bucketArn,
        region: config.bucketRegion,
        config: config.configPath,
        license: config.licensePath,
      }),
    });
  }
}

/**
 * Interface that represents a FortiGate port.
 */
export interface FortiGateClusterPort {
  subnetName: string;
  ipAddresses: { [availabilityZone: string]: string };
  eip: boolean;
}

export enum FortiGateImageType {
  BringYourOwnLicense,
  PayAsYouGo,
}

export interface FortiGateClusterProps {
  vpcCidrBlock: string;
  imageId: string;
  instanceType: string;
}

export class FortiGateCluster extends cdk.Construct {
  private readonly props: FortiGateClusterProps;
  private readonly instances: FortiGateInstance[] = [];
  private readonly instanceRole: iam.Role;
  private readonly instanceProfile: iam.CfnInstanceProfile;
  private readonly keyPairName: string;
  private readonly keyPair: KeyPair;

  constructor(scope: cdk.Construct, id: string, props: FortiGateClusterProps) {
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

    this.keyPairName = 'FortiGate';
    this.keyPair = new KeyPair(this, 'KeyPair', {
      name: this.keyPairName,
      secretPrefix: 'accelerator/keypairs',
    });
  }

  createInstance(hostname: string): FortiGateInstance {
    const index = this.instances.length;

    // Create a FortiGate instance in this
    const instance = new FortiGateInstance(this, `Instance${index}`, {
      hostname,
      vpcCidr: this.props.vpcCidrBlock,
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      keyPairName: this.keyPairName,
      iamInstanceProfileArn: this.instanceProfile.attrArn,
    });
    this.instances.push(instance);
    return instance;
  }
}

export interface FortiGateConfigParameters {
  Hostname: string;
  VPCCIDR: string;
  [key: string]: string;
}

export interface FortiGateConfigProps {
  parameters: FortiGateConfigParameters;
}

export class FortiGateConfig extends cdk.Construct {
  private readonly config: s3assets.Asset;

  constructor(scope: cdk.Construct, id: string, props: FortiGateConfigProps) {
    super(scope, id);

    const { parameters } = props;

    // TODO Download license file and put it in an S3 asset

    // Create a temporary file where we write the generated configuration file
    const configPath = tempy.file({
      extension: 'txt',
    });
    fs.writeFileSync(
      configPath,
      `
config system global
set hostname ${parameters.Hostname}
set admintimeout 60
set vdom-mode split-vdom
end
config system settings
set allow-subnet-overlap enable
end
config global
config system interface
edit port1
set vdom FG-traffic
set alias public
set mode static
set ip ${parameters.Port1IP}
set allowaccess ping https ssh fgfm
set secondary-IP enable
set mtu-override enable
set mtu 9001
next
edit port2
set vdom FG-traffic
set alias private
set mode static
set ip ${parameters.Port2IP}
set allowaccess ping
set mtu-override enable
set mtu 9001
next
edit port3
set vdom root
set alias mgmt
set mode static
set ip ${parameters.Port3IP}
set allowaccess ping https ssh fgfm
set mtu-override enable
set mtu 9001
next
edit port4
set vdom FG-traffic
set alias DMZ
set mode static
set ip ${parameters.Port4IP}
set allowaccess ping
set mtu-override enable
set mtu 9001
next
end
end
config vdom
edit FG-traffic
config router static
edit 1
set device port1
set gateway ${parameters.Port1RouterIP}
next
edit 2
set dst ${parameters.VPCCIDR}
set device port2
set gateway ${parameters.Port2RouterIP}
next
end
next
edit root
config router static
edit 1
set device port3
set gateway ${parameters.Port3RouterIP}
next
end
end`,
    );

    this.config = new s3assets.Asset(this, 'Config', {
      path: configPath,
    });
  }

  get bucketRegion(): string {
    const stack = cdk.Stack.of(this);
    return stack.region;
  }

  get bucketArn(): string {
    return this.config.bucket.bucketArn;
  }

  get configPath(): string {
    return this.config.assetPath;
  }

  get licensePath(): string | undefined {
    return undefined;
  }
}

function getFirstIp(cidrBlock: string) {
  const range = IPv4CidrRange.fromCidr(cidrBlock);
  const firstIp = range.getFirst();
  return firstIp.toString();
}
