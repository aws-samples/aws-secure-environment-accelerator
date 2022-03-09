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
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as ec2 from '@aws-cdk/aws-ec2';
import { IInstanceProfile } from '../iam';
import { FirewallInstance, FirewallConfigurationProps } from './instance';

export type FirewallClusterConfigurationProps = Omit<FirewallConfigurationProps, 'configPath'>;

export interface FirewallClusterProps {
  vpcCidrBlock: string;
  additionalCidrBlocks: string[];
  imageId: string;
  enforceImdsV2: boolean;
  instanceType: string;
  instanceRole: iam.IRole;
  instanceProfile: IInstanceProfile;
  keyPairName?: string;
  configuration: FirewallClusterConfigurationProps;
  blockDeviceMappings: ec2.CfnInstance.BlockDeviceMappingProperty[];
}

export class FirewallCluster extends cdk.Construct {
  readonly instances: FirewallInstance[] = [];

  constructor(scope: cdk.Construct, id: string, private readonly props: FirewallClusterProps) {
    super(scope, id);
  }

  createInstance(props: {
    name: string;
    hostname: string;
    licensePath?: string;
    licenseBucket?: s3.IBucket;
    userData?: string;
  }): FirewallInstance {
    const { name, hostname, licensePath, licenseBucket } = props;
    let { userData } = props;
    const index = this.instances.length;
    if (userData) {
      /* eslint-disable no-template-curly-in-string */
      userData = userData.replace(
        new RegExp('\\${SEA:CUSTOM::FirewallConfig}', 'g'),
        `/fgtconfig-init-${hostname}-${index}.txt`,
      );
      if (licensePath) {
        userData = userData.replace(new RegExp('\\${SEA:CUSTOM::FirewallLicense}', 'g'), `/${licensePath}`);
      }
      /* eslint-enable */
    }
    const instance = new FirewallInstance(this, `Instance${index}`, {
      name,
      hostname,
      licensePath,
      licenseBucket,
      vpcCidrBlock: this.props.vpcCidrBlock,
      additionalCidrBlocks: this.props.additionalCidrBlocks,
      imageId: this.props.imageId,
      enforceImdsV2: this.props.enforceImdsV2,
      instanceType: this.props.instanceType,
      instanceProfile: this.props.instanceProfile,
      keyPairName: this.props.keyPairName,
      configuration: {
        ...this.props.configuration,
        configPath: `fgtconfig-init-${hostname}-${index}.txt`,
      },
      blockDeviceMappings: this.props.blockDeviceMappings,
      userData,
    });

    this.instances.push(instance);
    return instance;
  }
}
