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
import { ReplicationRules, EncryptionConfiguration } from 'aws-sdk/clients/s3';
import { S3PutBucketReplication } from '@aws-accelerator/custom-resource-s3-put-bucket-replication';

export interface BucketReplicationProps {
  bucket: s3.IBucket;
  s3PutReplicationRole: string;
  replicationRoleName?: string;
  destinationBucket?: s3.IBucket;
  destinationAccountId?: string;
  prefix?: string;
}

/**
 * Wrapper around s3.Bucket that has additional information about the bucket, such as the resolved bucket ARN, the
 * resolved encryption key ARN, the resolved account ID. This allows it to be used in cross account replication.s
 */
export class BucketReplication extends cdk.Construct {
  private readonly resource: s3.CfnBucket;

  private readonly replicationRoleName: string | undefined;
  private readonly replicationRules: ReplicationRules = [];
  private readonly destinationS3Resources: string[] = [];
  private readonly destinationKmsResources: string[] = [];
  private readonly s3PutReplicationRole: string;
  private bucket: s3.IBucket;

  constructor(scope: cdk.Construct, id: string, props: BucketReplicationProps) {
    super(scope, id);
    this.replicationRoleName = props.replicationRoleName;
    this.bucket = props.bucket;
    this.s3PutReplicationRole = props.s3PutReplicationRole;
    // Get the underlying resource
    this.resource = (props.bucket as unknown) as s3.CfnBucket;
  }

  replicateFrom(principals: iam.IPrincipal[], organizationId: string, prefix: string) {
    this.bucket.addToResourcePolicy(
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
        resources: [this.bucket.bucketArn, this.bucket.arnForObjects('*')],
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
    if (this.bucket.encryptionKey) {
      this.bucket.encryptionKey.addToResourcePolicy(
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

  /**
   * Replicate to the given cross account bucket. No permissions are added to the destination bucket or destination
   * encryption key.
   */
  replicateTo(props: { destinationBucket: s3.IBucket; destinationAccountId: string; id: string; prefix?: string }) {
    const { destinationBucket, destinationAccountId, prefix, id } = props;

    // The permissions to replicate the objects will be added in the onPrepare method
    this.destinationS3Resources.push(destinationBucket.bucketArn);
    this.destinationS3Resources.push(`${destinationBucket.bucketArn}/*`);

    let encryptionConfiguration: EncryptionConfiguration;
    if (destinationBucket.encryptionKey) {
      // The permissions to encrypt using these keys will be added in the onPrepare method
      this.destinationKmsResources.push(destinationBucket.encryptionKey.keyArn);

      encryptionConfiguration = {
        ReplicaKmsKeyID: destinationBucket.encryptionKey.keyArn,
      };
    }

    // This is the replication configuration that will be used for the S3 bucket
    this.replicationRules.push({
      ID: `s3-replication-rule-${id}`,
      Status: 'Enabled',
      Prefix: prefix ?? '',
      SourceSelectionCriteria: {
        SseKmsEncryptedObjects: {
          Status: 'Enabled',
        },
      },
      Destination: {
        Bucket: destinationBucket.bucketArn,
        Account: destinationAccountId,
        EncryptionConfiguration: encryptionConfiguration!,
        StorageClass: 'STANDARD',
        AccessControlTranslation: {
          Owner: 'Destination',
        },
      },
    });
  }

  protected onPrepare() {
    if (this.replicationRules.length === 0) {
      // No need to create the replication role and rules if there are no rules
      return;
    }

    const replicationRole = new iam.Role(this, 'ReplicationRole', {
      roleName: this.replicationRoleName,
      assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
    });

    // Grant the replication role the actions to replicate the objects in the bucket
    replicationRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObjectLegalHold',
          's3:GetObjectRetention',
          's3:GetObjectVersion',
          's3:GetObjectVersionAcl',
          's3:GetObjectVersionForReplication',
          's3:GetObjectVersionTagging',
          's3:GetReplicationConfiguration',
          's3:ListBucket',
          's3:ReplicateDelete',
          's3:ReplicateObject',
          's3:ReplicateTags',
        ],
        resources: [this.bucket.bucketArn, this.bucket.arnForObjects('*')],
      }),
    );

    // Grant access for the ReplicationRole to read and write
    if (this.bucket.encryptionKey) {
      this.bucket.encryptionKey.grantEncryptDecrypt(replicationRole);
    }

    // Allow the replication role to replicate objects to the destination bucket
    replicationRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetBucketVersioning',
          's3:GetObjectVersionTagging',
          's3:ObjectOwnerOverrideToBucketOwner',
          's3:PutBucketVersioning',
          's3:ReplicateDelete',
          's3:ReplicateObject',
          's3:ReplicateTags',
        ],
        resources: this.destinationS3Resources,
      }),
    );

    // Allow the replication role to encrypt with the destination KMS key
    if (this.destinationKmsResources.length > 0) {
      replicationRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['kms:Encrypt'],
          resources: this.destinationKmsResources,
        }),
      );
    }

    new S3PutBucketReplication(this, `PutS3BucketReplication`, {
      bucketName: this.bucket.bucketName,
      replicationRole: replicationRole.roleArn,
      roleArn: this.s3PutReplicationRole,
      rules: this.replicationRules,
    });
  }
}
