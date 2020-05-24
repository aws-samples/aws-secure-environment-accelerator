import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';

export interface BucketProps {
  bucketName: string;
  encryptionKey?: kms.Key;
  expirationInDays: number;
  replicationRoleName?: string;
}

/**
 * Wrapper around s3.Bucket that has additional information about the bucket, such as the resolved bucket ARN, the
 * resolved encryption key ARN, the resolved account ID. This allows it to be used in cross account replication.s
 */
export class Bucket extends s3.Bucket {
  private readonly resource: s3.CfnBucket;
  private readonly replicationRoleName: string | undefined;
  private readonly replicationRules: s3.CfnBucket.ReplicationRuleProperty[] = [];
  private replicationRole: iam.Role | undefined;

  constructor(scope: cdk.Construct, id: string, props: BucketProps) {
    super(scope, id, {
      bucketName: props.bucketName,
      encryptionKey: props.encryptionKey,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
          expiration: cdk.Duration.days(props.expirationInDays),
          noncurrentVersionExpiration: cdk.Duration.days(props.expirationInDays),
        },
      ],
    });

    this.replicationRoleName = props.replicationRoleName;

    // Get the underlying resource
    this.resource = this.node.findChild('Resource') as s3.CfnBucket;
  }

  replicateFrom(accountIds: string[]) {
    const accountPrincipals = accountIds.map(id => new iam.AccountPrincipal(id));

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
        principals: accountPrincipals,
        resources: [this.bucketArn, this.arnForObjects('*')],
      }),
    );

    // Allow the whole account access to the destination encryption key
    // The replication role ARN cannot be used here as it would be a cross-account reference
    if (this.encryptionKey) {
      this.encryptionKey.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'Enable cross account encrypt access for S3 Cross Region Replication',
          actions: ['kms:Encrypt'],
          principals: accountPrincipals,
          resources: ['*'],
        }),
      );
    }
  }

  /**
   * Replicate to the given cross account bucket. No permissions are added to the destination bucket or destination
   * encryption key.
   */
  replicateTo(props: { destinationBucket: s3.IBucket; destinationAccountId: string }) {
    const { destinationBucket, destinationAccountId } = props;
    // Create a role that will be able to replicate to the log-archive bucket
    if (!this.replicationRole) {
      this.replicationRole = new iam.Role(this, 'ReplicationRole', {
        roleName: this.replicationRoleName,
        assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
      });

      // Grant the replication role the actions to replicate the objects in the bucket
      this.replicationRole.addToPolicy(
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
          resources: [this.bucketArn, this.arnForObjects('*')],
        }),
      );

      // Grant access for the ReplicationRole to read and write
      if (this.encryptionKey) {
        this.encryptionKey.grantEncryptDecrypt(this.replicationRole);
      }
    }

    // Allow the replication role to replicate objects to the destination bucket
    this.replicationRole.addToPolicy(
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
        // Use bucketName as bucketArn might be a cross account token
        resources: [destinationBucket.bucketArn, `${destinationBucket.bucketArn}/*`],
      }),
    );

    // Allow the replication role to encrypt using the destination KMS key
    let encryptionConfiguration;
    if (destinationBucket.encryptionKey) {
      // Allow the replication role to encrypt with the destination KMS key
      this.replicationRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['kms:Encrypt'],
          resources: [destinationBucket.encryptionKey.keyArn],
        }),
      );

      encryptionConfiguration = {
        replicaKmsKeyId: destinationBucket.encryptionKey.keyArn,
      };
    }

    if (!this.resource.replicationConfiguration) {
      this.resource.replicationConfiguration = {
        role: this.replicationRole.roleArn,
        rules: this.replicationRules,
      };
    }

    // This is the replication configuration that will be used for the S3 bucket
    this.replicationRules.push({
      id: `s3-replication-rule-${this.replicationRules}`,
      status: 'Enabled',
      prefix: '',
      sourceSelectionCriteria: {
        sseKmsEncryptedObjects: {
          status: 'Enabled',
        },
      },
      destination: {
        bucket: destinationBucket.bucketArn,
        account: destinationAccountId,
        encryptionConfiguration,
        storageClass: 'STANDARD',
        accessControlTranslation: {
          owner: 'Destination',
        },
      },
    });
  }
}
