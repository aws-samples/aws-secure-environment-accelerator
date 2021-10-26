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

export interface S3PublicAccessBlockProps {
  blockPublicAcls: boolean;
  blockPublicPolicy: boolean;
  ignorePublicAcls: boolean;
  restrictPublicBuckets: boolean;
  /**
   * @default cdk.Aws.ACCOUNT_ID
   */
  accountId?: string;
}

export class S3PublicAccessBlock extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: S3PublicAccessBlockProps) {
    super(scope, id);

    const { accountId, blockPublicAcls, blockPublicPolicy, ignorePublicAcls, restrictPublicBuckets } = props;

    const physicalResourceId = custom.PhysicalResourceId.of('PutPublicAccessBlock');
    new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::S3PutPublicAccessBlock',
      onCreate: {
        service: 'S3Control',
        action: 'putPublicAccessBlock',
        physicalResourceId,
        parameters: {
          AccountId: accountId ?? cdk.Aws.ACCOUNT_ID,
          PublicAccessBlockConfiguration: {
            BlockPublicAcls: blockPublicAcls,
            BlockPublicPolicy: blockPublicPolicy,
            IgnorePublicAcls: ignorePublicAcls,
            RestrictPublicBuckets: restrictPublicBuckets,
          },
        },
      },
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['s3:PutAccountPublicAccessBlock'],
          resources: ['*'],
        }),
      ]),
    });
  }
}
