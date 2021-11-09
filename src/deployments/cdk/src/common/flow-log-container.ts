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
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';

export interface FlowLogContainerProps {
  bucket: s3.IBucket;
  vpcNames: string[];
}

/**
 * Auxiliary construct that keeps allows us to create a single flow log bucket per account.
 */
export class FlowLogContainer extends cdk.Construct {
  readonly bucket: s3.IBucket;
  readonly role: iam.Role;

  constructor(scope: cdk.Construct, id: string, props: FlowLogContainerProps) {
    super(scope, id);

    this.bucket = props.bucket;
    this.role = new iam.Role(this, 'Role', {
      roleName: createRoleName('VPC-FlowLog'),
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    this.role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogDelivery',
          'logs:DeleteLogDelivery',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
        ],
        resources: ['*'],
      }),
    );

    if (props.vpcNames.length !== 0) {
      const destinations = props.vpcNames.map(v => `${this.bucket.bucketArn}/${cdk.Aws.ACCOUNT_ID}/${v}`);
      // Give the role access to the flow log bucket
      this.role.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['s3:*'],
          resources: [this.bucket.bucketArn, ...destinations],
        }),
      );
    }
  }
}
