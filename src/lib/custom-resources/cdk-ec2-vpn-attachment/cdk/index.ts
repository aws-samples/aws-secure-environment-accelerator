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
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface VpnAttachmentsProps {
  vpnConnectionId: string;
  tgwId: string;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class VpnAttachments extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: VpnAttachmentsProps) {
    super(scope, id);
    const { vpnConnectionId } = props;

    const physicalResourceId = custom.PhysicalResourceId.of(vpnConnectionId);
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'EC2',
      action: 'describeTransitGatewayAttachments',
      physicalResourceId,
      parameters: {
        Filters: [
          {
            Name: 'resource-id',
            Values: [props.vpnConnectionId],
          },
          {
            Name: 'transit-gateway-id',
            Values: [props.tgwId],
          },
        ],
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::VpnAttachments',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['ec2:DescribeTransitGatewayAttachments'],
          resources: ['*'],
        }),
      ]),
    });
  }

  getTransitGatewayAttachmentId(index: number): string {
    return this.resource.getResponseField(`TransitGatewayAttachments.${index}.TransitGatewayAttachmentId`);
  }
}
