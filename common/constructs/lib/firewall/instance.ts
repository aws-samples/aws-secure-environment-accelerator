import { IPv4CidrRange } from 'ip-num';
import { Keypair } from '@custom-resources/ec2-keypair';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
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
  /**
   * Account bucket where the template and license will be copied to.
   */
  bucket: s3.IBucket;
  bucketRegion: string;
  configPath: string;
}

export interface FirewallInstanceProps {
  name: string;
  hostname: string;
  vpcCidrBlock: string;
  licensePath?: string;
  licenseBucket?: s3.IBucket;
  /**
   * Image ID of firewall.
   */
  imageId: string;
  instanceType: string;
  iamInstanceProfile: iam.CfnInstanceProfile;
  keyPair: Keypair | string;
  configuration: FirewallConfigurationProps;
}

export class FirewallInstance extends cdk.Construct {
  private readonly props: FirewallInstanceProps;
  private readonly resource: ec2.CfnInstance;
  private readonly template: S3Template;
  private readonly networkInterfacesProps: ec2.CfnInstance.NetworkInterfaceProperty[] = [];

  constructor(scope: cdk.Construct, id: string, props: FirewallInstanceProps) {
    super(scope, id);

    this.props = props;

    const { configuration } = props;

    // Copy license without replacing anything
    // TODO Should we create another custom resource for this?
    if (props.licenseBucket && props.licensePath) {
      new S3Template(this, 'License', {
        templateBucket: props.licenseBucket,
        templatePath: props.licensePath,
        outputBucket: configuration.bucket,
        outputPath: props.licensePath,
      });
    }

    this.template = new S3Template(this, 'Config', {
      templateBucket: configuration.templateBucket,
      templatePath: configuration.templateConfigPath,
      outputBucket: configuration.bucket,
      outputPath: configuration.configPath,
    });

    this.addVpcReplacements(props.hostname, props.vpcCidrBlock);

    this.resource = new ec2.CfnInstance(this, 'Resource', {
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      iamInstanceProfile: this.props.iamInstanceProfile.ref,
      keyName: getKeyPairName(this.props.keyPair),
      networkInterfaces: this.networkInterfacesProps,
      userData: cdk.Fn.base64(
        JSON.stringify(
          {
            bucket: configuration.bucket.bucketName,
            region: configuration.bucketRegion,
            config: `/${configuration.configPath}`,
            license: `/${props.licensePath}`,
          },
          null,
          2,
        ),
      ),
    });
    cdk.Tag.add(this.resource, 'Name', this.props.name);

    this.resource.node.addDependency(this.props.iamInstanceProfile);
    this.resource.node.addDependency(this.template);

    if (this.props.keyPair instanceof cdk.DependableTrait) {
      this.resource.node.addDependency(this.props.keyPair);
    }
  }

  addNetworkInterface(props: {
    name: string;
    securityGroup: SecurityGroup;
    subnet: Subnet;
    eipAllocationId?: string;
    vpnTunnelOptions?: FirewallVpnTunnelOptions;
  }): ec2.CfnNetworkInterface {
    const { name, securityGroup, subnet, eipAllocationId, vpnTunnelOptions } = props;
    const index = this.networkInterfacesProps.length;

    // Create network interface
    const networkInterface = new ec2.CfnNetworkInterface(this, `Eni${index}`, {
      groupSet: [securityGroup.id],
      subnetId: subnet.id,
      sourceDestCheck: false,
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

function getKeyPairName(keyPairOrName: Keypair | string) {
  if (typeof keyPairOrName === 'string') {
    return keyPairOrName;
  }
  return keyPairOrName.keyName;
}
