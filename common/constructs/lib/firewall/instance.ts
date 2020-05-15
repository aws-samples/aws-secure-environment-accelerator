import { IPv4CidrRange } from 'ip-num';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as s3 from '@aws-cdk/aws-s3';
import { S3Template } from '@custom-resources/s3-template';
import { Subnet, SecurityGroup } from '../vpc';

export interface FirewallVpnTunnelOptions {
  cgwTunnelInsideAddress1: string;
  cgwTunnelOutsideAddress1: string;
  cgwBgpAsn1: string;
  vpnTunnelInsideAddress1: string;
  vpnTunnelOutsideAddress1: string;
  vpnBgpAsn1: string;
  preSharedSecret1: string;
}

export interface FirewallConfigurationProps {
  templateBucket: s3.IBucket;
  templateConfigPath: string;
  bucket: s3.IBucket;
  bucketRegion: string;
  configPath: string;
  licensePath: string;
}

export interface FirewallInstanceProps {
  hostname: string;
  vpcCidrBlock: string;
  /**
   * Image ID of firewall.
   */
  imageId: string;
  instanceType: string;
  iamInstanceProfileName: string;
  keyPairName: string;
  configuration: FirewallConfigurationProps;
}

export class FirewallInstance extends cdk.Construct {
  private readonly props: FirewallInstanceProps;
  private readonly resource: ec2.CfnInstance;
  private readonly template: S3Template;
  private readonly networkInterfaces: ec2.CfnNetworkInterface[] = [];
  private readonly networkInterfacesProps: ec2.CfnInstance.NetworkInterfaceProperty[] = [];

  constructor(scope: cdk.Construct, id: string, props: FirewallInstanceProps) {
    super(scope, id);

    this.props = props;

    const { configuration } = props;

    this.template = new S3Template(this, 'Config', {
      templateBucket: configuration.bucket,
      templatePath: configuration.templateConfigPath,
      outputBucket: configuration.bucket,
      outputPath: configuration.configPath,
    });

    this.addVpcReplacements(props.hostname, props.vpcCidrBlock);

    this.resource = new ec2.CfnInstance(this, 'Resource', {
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      iamInstanceProfile: this.props.iamInstanceProfileName,
      keyName: this.props.keyPairName,
      networkInterfaces: this.networkInterfacesProps,
      userData: cdk.Fn.base64(
        JSON.stringify(
          {
            bucket: configuration.bucket.bucketName,
            region: configuration.bucketRegion,
            config: `/${configuration.configPath}`,
            license: `/${configuration.licensePath}`,
          },
          null,
          2,
        ),
      ),
    });
    this.resource.node.addDependency(this.template);
  }

  addNetworkInterface(props: {
    name: string;
    securityGroup: SecurityGroup;
    subnet: Subnet;
    eipAllocationId?: string;
    vpnTunnelOptions?: FirewallVpnTunnelOptions;
  }) {
    const { name, securityGroup, subnet, eipAllocationId, vpnTunnelOptions } = props;
    const index = this.networkInterfaces.length;

    // Create network interface
    const networkInterface = new ec2.CfnNetworkInterface(this, `Eni${index}`, {
      groupSet: [securityGroup.id],
      subnetId: subnet.id,
      sourceDestCheck: false,
    });
    this.networkInterfaces.push(networkInterface);

    this.networkInterfacesProps.push({
      deviceIndex: `${index}`,
      networkInterfaceId: networkInterface.ref,
    });

    // Create EIP if needed
    if (eipAllocationId) {
      new ec2.CfnEIPAssociation(this, `ClusterEipAssoc${index}`, {
        networkInterfaceId: networkInterface.ref,
        allocationId: eipAllocationId,
        privateIpAddress: networkInterface.attrPrimaryPrivateIpAddress,
      });
    }

    const cidrBlock = IPv4CidrRange.fromCidr(subnet.cidrBlock);
    const cidrMask = cidrBlock.cidrPrefix.toSubnetMask();
    const networkIp = cidrBlock.getFirst();
    const routerIp = networkIp.nextIPNumber();

    // Store the IP and router IP in parameters
    // The 1 in "Ip1" is to plan for auto-scaling
    this.template.addReplacement(`\${${name}Ip1}`, networkInterface.attrPrimaryPrivateIpAddress);
    this.template.addReplacement(`\${${name}NetworkIp}`, networkIp.toString());
    this.template.addReplacement(`\${${name}RouterIp}`, routerIp.toString());
    this.template.addReplacement(`\${${name}Cidr}`, cidrBlock.toCidrString());
    this.template.addReplacement(`\${${name}Mask}`, cidrMask.toString());
    if (vpnTunnelOptions) {
      this.template.addReplacement(`\${${name}CgwTunnelOutsideAddress1}`, vpnTunnelOptions?.cgwTunnelOutsideAddress1);
      this.template.addReplacement(`\${${name}CgwTunnelInsideAddress1}`, vpnTunnelOptions?.cgwTunnelInsideAddress1);
      this.template.addReplacement(`\${${name}CgwBgpAsn1}`, vpnTunnelOptions?.cgwBgpAsn1);
      this.template.addReplacement(`\${${name}VpnTunnelOutsideAddress1}`, vpnTunnelOptions?.vpnTunnelOutsideAddress1);
      this.template.addReplacement(`\${${name}VpnTunnelInsideAddress1}`, vpnTunnelOptions?.vpnTunnelInsideAddress1);
      this.template.addReplacement(`\${${name}VpnBgpAsn1}`, vpnTunnelOptions?.vpnBgpAsn1);
      this.template.addReplacement(`\${${name}PreSharedSecret1}`, vpnTunnelOptions?.preSharedSecret1);
    }

    return networkInterface;
  }

  private addVpcReplacements(hostname: string, cidrBlock: string) {
    const vpcCidrBlock = IPv4CidrRange.fromCidr(cidrBlock);
    const vpcCidrMask = vpcCidrBlock.cidrPrefix.toSubnetMask();
    const vpcNetworkIp = vpcCidrBlock.getFirst();
    const vpcRouterIp = vpcNetworkIp.nextIPNumber();

    // tslint:disable-next-line: no-invalid-template-strings
    this.template.addReplacement('${Hostname}', hostname);
    // tslint:disable-next-line: no-invalid-template-strings
    this.template.addReplacement('${VpcMask}', vpcCidrMask.toString());
    // tslint:disable-next-line: no-invalid-template-strings
    this.template.addReplacement('${VpcCidr}', vpcCidrBlock.toCidrString());
    // tslint:disable-next-line: no-invalid-template-strings
    this.template.addReplacement('${VpcNetworkIp}', vpcNetworkIp.toString());
    // tslint:disable-next-line: no-invalid-template-strings
    this.template.addReplacement('${VpcRouterIp}', vpcRouterIp.toString());
  }

  get instanceId() {
    return this.resource.ref;
  }
}
