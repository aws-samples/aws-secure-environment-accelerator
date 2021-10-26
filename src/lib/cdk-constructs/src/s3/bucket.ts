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
import * as kms from '@aws-cdk/aws-kms';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';

export interface BucketProps {
  bucketName?: string;
  encryptionKey?: kms.Key;
  expirationInDays: number;
  replicationRoleName?: string;
  /**
   * @default cdk.RemovalPolicy.RETAIN
   */
  removalPolicy?: cdk.RemovalPolicy;
  versioned?: boolean;
}

/**
 * Wrapper around s3.Bucket that has additional information about the bucket, such as the resolved bucket ARN, the
 * resolved encryption key ARN, the resolved account ID. This allows it to be used in cross account replication.s
 */
export class Bucket extends s3.Bucket {
  private readonly resource: s3.CfnBucket;

  constructor(scope: cdk.Construct, id: string, props: BucketProps) {
    super(scope, id, {
      bucketName: props.bucketName,
      encryptionKey: props.encryptionKey,
      versioned: props.versioned,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
      // LifeCycle Configuration is also updated while enabling Bucket Version in phase-5
      lifecycleRules: [
        {
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
          expiration: cdk.Duration.days(props.expirationInDays),
          noncurrentVersionExpiration: props.versioned ? cdk.Duration.days(props.expirationInDays) : undefined,
        },
      ],
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    // Get the underlying resource
    this.resource = this.node.findChild('Resource') as s3.CfnBucket;
  }

  replicateFrom(principals: iam.IPrincipal[], organizationId: string, prefix: string) {
    this.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetBucketVersioning',
          's3:GetObjectVersionTagging',
          's3:ObjectOwnerOverrideToBucketOwner',
          's3:PutBucketVersioning',
          's3:ReplicateDelete',
          's3:ReplicateObject',
          's3:ReplicateTags',
          's3:List*',
        ],
        principals,
        resources: [this.bucketArn, this.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': organizationId,
          },
          ArnLike: {
            'aws:PrincipalARN': [`arn:aws:iam::*:role/${prefix}*`],
          },
        },
      }),
    );

    // Allow the whole oganization access to the destination encryption key
    // The replication role ARN cannot be used here as it would be a cross-account reference
    if (this.encryptionKey) {
      this.encryptionKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'Enable cross account encrypt access for S3 Cross Region Replication',
          actions: ['kms:Encrypt'],
          principals,
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:PrincipalOrgID': organizationId,
            },
          },
        }),
      );
    }
  }
}
