import * as fs from 'fs';
import * as tempy from 'tempy';
import { IPv4CidrRange } from 'ip-num';
import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as s3assets from '@aws-cdk/aws-s3-assets';
import { KeyPair } from 'cdk-ec2-key-pair';
import { Vpc } from '../vpc/vpc';

/**
 * Interface that represents a network interface in a FortiGate instance.
 */
export interface FortiGateInstanceNetworkInterface {
  /**
   * The subnet ID to use for the network interface.
   */
  subnetId: string;
  /**
   * Internal IP for the public interface of the instance.
   */
  privateIpAddress: string;
  /**
   * EIP allocation ID if any.
   */
  eipAllocationId?: string;
}

export interface FortiGateInstanceProps {
  config: FortiGateConfig;
  /**
   * Image ID of FortiGate.
   */
  imageId: string;
  instanceType: string;
  iamInstanceProfileArn: string;
  keyPairArn: string;
  /**
   * Network interfaces to create for this instance.
   */
  networkInterfaces: FortiGateInstanceNetworkInterface[];
  /**
   * Security group of the instance.
   */
  securityGroupId: string;
}

export class FortiGateInstance extends cdk.Construct {
  readonly resource: ec2.CfnInstance;
  readonly networkInterfaces: ec2.CfnNetworkInterface[] = [];

  constructor(scope: cdk.Construct, id: string, props: FortiGateInstanceProps) {
    super(scope, id);

    const {
      config,
      imageId,
      instanceType,
      iamInstanceProfileArn,
      keyPairArn: keypairArn,
      networkInterfaces,
      securityGroupId,
    } = props;

    // Create a network interface for the given subnets
    for (const networkInterface of networkInterfaces) {
      const eni = new ec2.CfnNetworkInterface(this, `Eni${this.networkInterfaces.length}`, {
        groupSet: [securityGroupId],
        subnetId: networkInterface.subnetId,
        sourceDestCheck: false,
        privateIpAddresses: [
          {
            privateIpAddress: networkInterface.privateIpAddress,
            primary: true,
          },
        ],
      });

      // Associate to the given EIP allocation
      if (networkInterface.eipAllocationId) {
        new ec2.CfnEIPAssociation(this, `ClusterEipAssoc${this.networkInterfaces.length}`, {
          allocationId: networkInterface.eipAllocationId,
          privateIpAddress: networkInterface.privateIpAddress,
        });
      }

      this.networkInterfaces.push(eni);
    }

    // Create the EC2 instance that will run FortiGate
    this.resource = new ec2.CfnInstance(this, 'Resource', {
      imageId,
      instanceType,
      iamInstanceProfile: iamInstanceProfileArn,
      keyName: keypairArn,
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
  vpc: Vpc;
  imageId: string;
  instanceType: string;
  securityGroupName: string;
  ports: FortiGateClusterPort[];
}

export class FortiGateCluster extends cdk.Construct {
  private readonly instances: FortiGateInstance[] = [];

  constructor(scope: cdk.Construct, id: string, props: FortiGateClusterProps) {
    super(scope, id);

    const { vpc, imageId, instanceType, securityGroupName, ports } = props;

    // Find the security group in the VPC
    const securityGroup = vpc.findSecurityGroupByName(securityGroupName);

    const instanceRole = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:Describe*',
          'ec2:AssociateAddress',
          'ec2:AssignPrivateIpAddresses',
          'ec2:UnassignPrivateIpAddresses',
          'ec2:ReplaceRoute',
          's3:GetObject',
        ],
      }),
    );
    const instanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      path: '/',
      roles: [instanceRole.roleArn],
    });

    const keyPair = new KeyPair(this, 'KeyPair', {
      name: 'FortiGate',
      secretPrefix: 'accelerator/keypairs',
    });

    // Find all AZs and create an instance per AZ
    const availabilityZones = vpc.subnets.map(s => s.az);
    for (const az of new Set(availabilityZones)) {
      const parameters: FortiGateConfigParameters = {
        Hostname: `Fgt${this.instances.length}`,
        VPCCIDR: vpc.cidrBlock,
      };

      const networkInterfaces: FortiGateInstanceNetworkInterface[] = [];
      for (const [portIndex, port] of Object.entries(ports)) {
        const subnet = vpc.findSubnetByNameAndAvailabilityZone(port.subnetName, az);
        const ip = port.ipAddresses[az];

        // Create EIP if needed
        let eip;
        if (port.eip) {
          eip = new ec2.CfnEIP(this, `Eip${pascalCase(az)}${portIndex}`, {
            domain: 'vpc',
          });
        }

        // Add to network interfaces that will be create in the FortiGate instance
        networkInterfaces.push({
          subnetId: subnet.id,
          privateIpAddress: cdk.Fn.select(0, cdk.Fn.split('/', ip)),
          eipAllocationId: eip?.attrAllocationId,
        });

        // Store the IP and router IP in parameters
        parameters[`Port${portIndex}IP`] = ip;
        parameters[`Port${portIndex}RouterIP`] = getFirstIp(subnet.cidrBlock);
      }

      const index = this.instances.length;
      const config = new FortiGateConfig(this, `Config${index}`, {
        parameters,
      });

      // Create a FortiGate instance in this
      const instance = new FortiGateInstance(this, `Instance${index}`, {
        config,
        imageId,
        instanceType,
        keyPairArn: keyPair.arn,
        iamInstanceProfileArn: instanceProfile.attrArn,
        securityGroupId: securityGroup.id,
        networkInterfaces,
      });
      this.instances.push(instance);
    }
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
