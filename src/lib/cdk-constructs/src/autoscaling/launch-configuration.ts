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

import hashSum from 'hash-sum';
import * as cdk from '@aws-cdk/core';
import * as autoscaling from '@aws-cdk/aws-autoscaling';

export type LaunchConfigurationProps = autoscaling.CfnLaunchConfigurationProps;

/**
 * Added to update the hash for Rsyslog UserData properties
 */
interface LaunchConfigurationCustomProps extends LaunchConfigurationProps {
  centralBucketName?: string;
  logGroupName?: string;
}

/**
 * Wrapper around CfnLaunchConfiguration. The construct adds a hash to the launch configuration name that is based on
 * the launch configuration properties. The hash makes sure the launch configuration gets replaced correctly by CloudFormation.
 */
export class LaunchConfiguration extends autoscaling.CfnLaunchConfiguration {
  constructor(scope: cdk.Construct, id: string, props: LaunchConfigurationCustomProps) {
    super(scope, id, props);

    const hash = hashSum({ ...props, path: this.node.path });
    this.launchConfigurationName = props.launchConfigurationName
      ? `${props.launchConfigurationName}-${hash}`
      : undefined;
  }
}
