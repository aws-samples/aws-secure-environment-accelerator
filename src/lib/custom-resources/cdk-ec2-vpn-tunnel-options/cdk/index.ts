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

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { HandlerProperties } from '@aws-accelerator/custom-resource-ec2-vpn-tunnel-options-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::EC2VpnTunnelOptions';

export interface VpnTunnelOptionsProps {
  vpnConnectionId: string;
}

export type Attribute =
  | 'CgwOutsideIpAddress1'
  | 'CgwOutsideIpAddress2'
  | 'CgwInsideIpAddress1'
  | 'CgwInsideIpAddress2'
  | 'CgwInsideNetworkMask1'
  | 'CgwInsideNetworkMask2'
  | 'CgwInsideNetworkCidr1'
  | 'CgwInsideNetworkCidr2'
  | 'CgwBgpAsn1'
  | 'CgwBgpAsn2'
  | 'VpnOutsideIpAddress1'
  | 'VpnOutsideIpAddress2'
  | 'VpnInsideIpAddress1'
  | 'VpnInsideIpAddress2'
  | 'VpnInsideNetworkMask1'
  | 'VpnInsideNetworkMask2'
  | 'VpnInsideNetworkCidr1'
  | 'VpnInsideNetworkCidr2'
  | 'VpnBgpAsn1'
  | 'VpnBgpAsn2'
  | 'PreSharedKey1'
  | 'PreSharedKey2';

/**
 * Custom resource that has an VPN tunnel options attribute for the VPN connection with the given ID.
 */
export class VpnTunnelOptions extends Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: Construct, id: string, props: VpnTunnelOptionsProps) {
    super(scope, id);

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-ec2-vpn-tunnel-options-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_18_X,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['ec2:DescribeVpnConnections'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    const handlerProperties: HandlerProperties = {
      VPNConnectionID: props.vpnConnectionId,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: handlerProperties,
    });
  }

  /**
   * Returns the given CloudFormation attribute.
   */
  getAttString(attribute: Attribute) {
    return this.resource.getAttString(attribute);
  }
}
