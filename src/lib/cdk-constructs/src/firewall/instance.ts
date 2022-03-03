/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { IPv4CidrRange } from 'ip-num';
import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as s3 from '@aws-cdk/aws-s3';
import { S3Template } from '@aws-accelerator/custom-resource-s3-template';
import { IInstanceProfile } from '../iam';
import { Subnet, SecurityGroup } from '../vpc';
import { CfnSleep } from '@aws-accelerator/custom-resource-cfn-sleep';
import { EC2DisableApiTermination } from '@aws-accelerator/custom-resource-ec2-disable-api-termination';
import { EC2ModifyMetadataOptions } from '@aws-accelerator/custom-resource-ec2-modify-metadata-options';

export interface FirewallVpnTunnelOptions {
  cgwTunnelInsideAddress1: string;
  cgwTunnelOutsideAddress1: string;
  vpnTunnelInsideAddress1: string;
  vpnTunnelOutsideAddress1: string;
  preSharedSecret1: string;
  preSharedSecret2: string;
  vpnTunnelInsideAddress2: string;
  vpnTunnelOutsideAddress2: string;
  cgwTunnelInsideAddress2: string;
  cgwTunnelOutsideAddress2: string;
  cgwBgpAsn1?: string;
  vpnBgpAsn1?: string;
}

export interface FirewallConfigurationProps {
  templateBucket: s3.IBucket;
  templateConfigPath?: string;
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
  enforceImdsV2: boolean;
  additionalCidrBlocks: string[];
  licensePath?: string;
  licenseBucket?: s3.IBucket;
  /**
   * Image ID of firewall.
   */
  imageId: string;
  instanceType: string;
  instanceProfile: IInstanceProfile;
  keyPairName?: string;
  configuration: FirewallConfigurationProps;
  blockDeviceMappings: ec2.CfnInstance.BlockDeviceMappingProperty[];
  userData?: string;
}

export class FirewallInstance extends cdk.Construct {
  private readonly resource: ec2.CfnInstance;
  private readonly template?: S3Template;
  private readonly networkInterfacesProps: ec2.CfnInstance.NetworkInterfaceProperty[] = [];
  readonly instanceName: string;
  constructor(scope: cdk.Construct, id: string, private readonly props: FirewallInstanceProps) {
    super(scope, id);

    const { configuration, blockDeviceMappings, userData } = props;

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

    if (configuration.templateConfigPath) {
      this.template = new S3Template(this, 'Config', {
        templateBucket: configuration.templateBucket,
        templatePath: configuration.templateConfigPath,
        outputBucket: configuration.bucket,
        outputPath: configuration.configPath,
      });
      this.addVpcReplacements();
    }

    this.resource = new ec2.CfnInstance(this, 'Resource', {
      imageId: this.props.imageId,
      instanceType: this.props.instanceType,
      iamInstanceProfile: this.props.instanceProfile.instanceProfileName,
      keyName: this.props.keyPairName!,
      networkInterfaces: this.networkInterfacesProps,
      blockDeviceMappings,
      userData: userData
        ? cdk.Fn.base64(userData)
        : cdk.Fn.base64(
            JSON.stringify(
              {
                bucket: configuration.bucket.bucketName,
                region: configuration.bucketRegion,
                config: `/${configuration.configPath}`,
                license: props.licensePath ? `/${props.licensePath}` : '',
              },
              null,
              2,
            ),
          ),
    });
    cdk.Tags.of(this.resource).add('Name', this.props.name);
    this.instanceName = this.props.name;
    if (this.template) {
      this.resource.node.addDependency(this.template);
    }

    new EC2ModifyMetadataOptions(this, `EC2${this.props.name}ModifyMetadataOptions`, {
      ec2Id: this.resource.ref,
      ec2Name: this.props.name,
      httpEndpoint: 'enabled',
      httpTokens: this.props.enforceImdsV2 ? 'required' : 'optional',
    });

    new EC2DisableApiTermination(this, `EC2${this.props.name}DisableApiTermination`, {
      ec2Id: this.resource.ref,
      ec2Name: this.props.name,
    });
  }

  addNetworkInterface(props: {
    name: string;
    securityGroup: SecurityGroup;
    subnet: Subnet;
    privateStaticIp?: string;
    eipAllocationId?: string;
    vpnTunnelOptions?: FirewallVpnTunnelOptions;
    additionalReplacements?: { [key: string]: string };
  }): ec2.CfnNetworkInterface {
    const {
      name,
      securityGroup,
      subnet,
      privateStaticIp,
      eipAllocationId,
      vpnTunnelOptions,
      additionalReplacements,
    } = props;
    const index = this.networkInterfacesProps.length;

    // Create network interface
    const networkInterface = new ec2.CfnNetworkInterface(this, `Eni${index}`, {
      groupSet: [securityGroup.id],
      subnetId: subnet.id,
      sourceDestCheck: false,
      privateIpAddress: privateStaticIp,
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
        privateIpAddress: networkInterface.attrPrimaryPrivateIpAddress,
      });
      // Sleep 60 seconds after creation of the Ec2 instance
      const roleSleep = new CfnSleep(this, `ClusterEipAssocSleep${index}`, {
        sleep: 60 * 1000,
      });
      roleSleep.node.addDependency(this.resource);
      eipAssociation.node.addDependency(roleSleep);
    }

    const cidrBlock = IPv4CidrRange.fromCidr(subnet.cidrBlock);
    const cidrMask = cidrBlock.cidrPrefix.toMask();
    const networkIp = cidrBlock.getFirst();
    const routerIp = networkIp.nextIPNumber();

    // Store the IP and router IP in parameters
    // The 1 in "Ip1" is to plan for auto-scaling
    if (this.template) {
      this.template.addReplacement(`\${${name}Ip1}`, networkInterface.attrPrimaryPrivateIpAddress);
      this.template.addReplacement(`\${${name}NetworkIp}`, networkIp.toString());
      this.template.addReplacement(`\${${name}RouterIp}`, routerIp.toString());
      this.template.addReplacement(`\${${name}Cidr}`, cidrBlock.toCidrString());
      this.template.addReplacement(`\${${name}Mask}`, cidrMask.toString());
      if (vpnTunnelOptions) {
        this.template.addReplacement(`\${${name}CgwTunnelOutsideAddress1}`, vpnTunnelOptions?.cgwTunnelOutsideAddress1);
        this.template.addReplacement(`\${${name}CgwTunnelInsideAddress1}`, vpnTunnelOptions?.cgwTunnelInsideAddress1);
        if (vpnTunnelOptions.cgwBgpAsn1) {
          this.template.addReplacement(`\${${name}CgwBgpAsn1}`, vpnTunnelOptions.cgwBgpAsn1);
        }
        this.template.addReplacement(`\${${name}VpnTunnelOutsideAddress1}`, vpnTunnelOptions?.vpnTunnelOutsideAddress1);
        this.template.addReplacement(`\${${name}VpnTunnelInsideAddress1}`, vpnTunnelOptions?.vpnTunnelInsideAddress1);
        if (vpnTunnelOptions.vpnBgpAsn1) {
          this.template.addReplacement(`\${${name}VpnBgpAsn1}`, vpnTunnelOptions.vpnBgpAsn1);
        }
        this.template.addReplacement(`\${${name}PreSharedSecret1}`, vpnTunnelOptions?.preSharedSecret1);
        this.template.addReplacement(`\${${name}CgwTunnelOutsideAddress2}`, vpnTunnelOptions?.cgwTunnelOutsideAddress2);
        this.template.addReplacement(`\${${name}CgwTunnelInsideAddress2}`, vpnTunnelOptions?.cgwTunnelInsideAddress2);
        this.template.addReplacement(`\${${name}VpnTunnelOutsideAddress2}`, vpnTunnelOptions?.vpnTunnelOutsideAddress2);
        this.template.addReplacement(`\${${name}VpnTunnelInsideAddress2}`, vpnTunnelOptions?.vpnTunnelInsideAddress2);
        this.template.addReplacement(`\${${name}PreSharedSecret2}`, vpnTunnelOptions?.preSharedSecret2);
      }
      if (additionalReplacements) {
        for (const [key, value] of Object.entries(additionalReplacements)) {
          this.template.addReplacement(key, value);
        }
      }
    }

    return networkInterface;
  }

  private addVpcReplacements() {
    // eslint-disable-next-line no-template-curly-in-string
    this.template?.addReplacement('${Hostname}', this.props.hostname);

    const addVpcReplacement = (cidrBlock: string, suffix: string) => {
      const vpcCidrBlock = IPv4CidrRange.fromCidr(cidrBlock);
      const vpcCidrMask = vpcCidrBlock.cidrPrefix.toMask();
      const vpcNetworkIp = vpcCidrBlock.getFirst();
      const vpcRouterIp = vpcNetworkIp.nextIPNumber();

      this.template?.addReplacement(`\${VpcMask${suffix}}`, vpcCidrMask.toString());
      this.template?.addReplacement(`\${VpcCidr${suffix}}`, vpcCidrBlock.toCidrString());
      this.template?.addReplacement(`\${VpcNetworkIp${suffix}}`, vpcNetworkIp.toString());
      this.template?.addReplacement(`\${VpcRouterIp${suffix}}`, vpcRouterIp.toString());
    };

    // Add default VPC CIDR block replacements
    addVpcReplacement(this.props.vpcCidrBlock, '');

    // Add additional VPC CIDR block replacements
    // The first additional CIDR block replacement suffix will start with '2'
    //    i.e. VpcMask2, VpcCidr2
    this.props.additionalCidrBlocks.forEach((additionalCidrBlock, index) => {
      addVpcReplacement(additionalCidrBlock, `${index + 2}`);
    });
  }

  get instanceId() {
    return this.resource.ref;
  }

  get replacements(): { [key: string]: string } {
    return this.template?.replacements!;
  }
}
