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

import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { SecurityGroup, Subnet } from '../vpc';
import { CfnSleep } from '@aws-accelerator/custom-resource-cfn-sleep';
import { EC2DisableApiTermination } from '@aws-accelerator/custom-resource-ec2-disable-api-termination';
import { EC2ModifyMetadataOptions } from '@aws-accelerator/custom-resource-ec2-modify-metadata-options';

export interface FirewallManagerProps {
  name: string;
  configName: string;
  /**
   * Image ID of firewall.
   */
  imageId: string;
  enforceImdsV2: boolean;
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

    new EC2ModifyMetadataOptions(this, `EC2${this.props.configName}ModifyMetadataOptions`, {
      ec2Id: this.resource.ref,
      ec2Name: this.props.name,
      httpEndpoint: 'enabled',
      httpTokens: this.props.enforceImdsV2 ? 'required' : 'optional',
    });

    new EC2DisableApiTermination(this, `EC2-FWMNG${this.props.configName}DisableApiTermination`, {
      ec2Id: this.resource.ref,
      ec2Name: this.props.name,
    });
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
