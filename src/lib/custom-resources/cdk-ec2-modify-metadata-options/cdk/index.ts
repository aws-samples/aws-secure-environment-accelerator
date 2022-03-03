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

export interface EC2ModifyMetadataOptionsProps {
  ec2Name: string;
  ec2Id: string;
  httpEndpoint?: 'disabled' | 'enabled';
  httpProtocolIpv6?: 'disabled' | 'enabled';
  httpPutResponseHopLimit?: number;
  httpTokens?: 'required' | 'optional';
}

/**
 * Custom resource implementation that add the possibility to modify the metadata options on the ec2.
 */
export class EC2ModifyMetadataOptions extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, readonly props: EC2ModifyMetadataOptionsProps) {
    super(scope, id);

    const physicalResourceId = custom.PhysicalResourceId.of(`${props.ec2Name}-ModifyMetadataOptions`);

    const onCreateOrUpdate = {
      service: 'EC2',
      action: 'modifyInstanceMetadataOptions',
      physicalResourceId,
      parameters: {
        InstanceId: this.props.ec2Id,
        HttpEndpoint: this.props.httpEndpoint,
        HttpProtocolIpv6: this.props.httpProtocolIpv6,
        HttpPutResponseHopLimit: this.props.httpPutResponseHopLimit,
        HttpTokens: this.props.httpTokens,
      },
    };
    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::EC2ModifyMetadataOptions',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({ resources: custom.AwsCustomResourcePolicy.ANY_RESOURCE }),
    });
  }
}
