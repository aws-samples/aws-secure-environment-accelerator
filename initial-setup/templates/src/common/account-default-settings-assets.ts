import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as accessanalyzer from '@aws-cdk/aws-accessanalyzer';
import {
  IamConfig,
  IamConfigType,
  IamPolicyConfigType,
  IamUserConfigType,
  IamRoleConfigType,
} from '@aws-pbmm/common-lambda/lib/config';
import { Account, getAccountId } from '../utils/accounts';
import { Secret } from '@aws-cdk/aws-secretsmanager';
import { AcceleratorNameGenerator } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface FlowLogBucketReplication {
  accountId: string;
  kmsKeyArn: string;
  bucketArn: string;
}

export interface AccountDefaultSettingsAssetsProps {
  accountId: string;
  accountKey: string;
  iamConfig?: IamConfig;
  accounts: Account[];
  userPasswords: { [userId: string]: Secret };
  s3BucketNameForCur: string;
  expirationInDays: number;
  replication?: FlowLogBucketReplication;
}

export class AccountDefaultSettingsAssets extends cdk.Construct {
  readonly kmsKeyIdForEbsDefaultEncryption: string;

  constructor(scope: cdk.Construct, id: string, props: AccountDefaultSettingsAssetsProps) {
    super(scope, id);
    const {
      accountId,
      accountKey,
      iamConfig,
      accounts,
      userPasswords,
      s3BucketNameForCur,
      expirationInDays,
      replication,
    } = props;

    // kms key used for default EBS encryption
    const kmsKey = new kms.Key(this, 'EBS-DefaultEncryption', {
      alias: 'alias/' + AcceleratorNameGenerator.generate('EBSDefaultKey'),
      description: 'PBMM - Key used to encrypt/decrypt EBS by default',
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'key-consolepolicy-3',
            effect: iam.Effect.ALLOW,
            principals: [new iam.AccountPrincipal(cdk.Aws.ACCOUNT_ID)],
            actions: ['kms:*'],
            resources: ['*'],
          }),
        ],
      }),
    });

    // save the kmsKeyArn for later use
    this.kmsKeyIdForEbsDefaultEncryption = kmsKey.keyId;

    const customerManagedPolicies: { [policyName: string]: iam.ManagedPolicy } = {};
    // method to create IAM Policy
    const createIamPolicy = (policyName: string, policy: string): void => {
      const iamPolicy = new iam.ManagedPolicy(this, `IAM-Policy-${policyName}-${accountKey}`, {
        managedPolicyName: policyName,
        description: `PBMM - ${policyName}`,
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['*'],
            resources: ['*'],
          }),
        ],
      });
      customerManagedPolicies[policyName] = iamPolicy;
    };

    // method to create IAM User & Group
    const createIamUser = (userIds: string[], groupName: string, policies: string[], boundaryPolicy: string): void => {
      const iamGroup = new iam.Group(this, `IAM-Group-${groupName}-${accountKey}`, {
        groupName,
        managedPolicies: policies.map(x => iam.ManagedPolicy.fromAwsManagedPolicyName(x)),
      });

      for (const userId of userIds) {
        const iamUser = new iam.User(this, `IAM-User-${userId}-${accountKey}`, {
          userName: userId,
          password: userPasswords[userId].secretValue,
          groups: [iamGroup],
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
        });
      }
    };

    // method to create IAM Role
    const createIamRole = (
      role: string,
      type: string,
      policies: string[],
      boundaryPolicy: string,
      sourceAccount?: string,
      sourceAccountRole?: string,
      trustPolicy?: string,
    ): void => {
      if (sourceAccount && sourceAccountRole && trustPolicy) {
        const sourceAccountId = getAccountId(accounts, sourceAccount);

        const iamRole = new iam.Role(this, `IAM-Role-${role}-${accountKey}`, {
          roleName: role,
          description: `PBMM - ${role}`,
          assumedBy: new iam.ArnPrincipal(`arn:aws:iam::${sourceAccountId}:role/${sourceAccountRole}`),
          managedPolicies: policies.map(
            x => customerManagedPolicies[x] ?? iam.ManagedPolicy.fromAwsManagedPolicyName(x),
          ),
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
        });
      } else {
        const iamRole = new iam.Role(this, `IAM-Role-${role}`, {
          roleName: role,
          description: `PBMM - ${role}`,
          assumedBy: new iam.ServicePrincipal(`${type}.amazonaws.com`),
          managedPolicies: policies.map(
            x => customerManagedPolicies[x] ?? iam.ManagedPolicy.fromAwsManagedPolicyName(x),
          ),
          permissionsBoundary: customerManagedPolicies[boundaryPolicy],
        });
      }
    };

    if (!IamConfigType.is(iamConfig)) {
      console.log(
        `IAM config is not defined for account with key - ${accountKey}. Skipping Policies/Users/Roles creation.`,
      );
    } else {
      const iamPolicies = iamConfig.policies;
      for (const iamPolicy of iamPolicies!) {
        if (!IamPolicyConfigType.is(iamPolicy)) {
          console.log(
            `IAM config - policies is not defined for account with key - ${accountKey}. Skipping Policies creation.`,
          );
        } else {
          createIamPolicy(iamPolicy['policy-name'], iamPolicy.policy);
        }
      }

      const iamUsers = iamConfig.users;
      for (const iamUser of iamUsers!) {
        if (!IamUserConfigType.is(iamUser)) {
          console.log(
            `IAM config - users is not defined for account with key - ${accountKey}. Skipping Users creation.`,
          );
        } else {
          createIamUser(iamUser['user-ids'], iamUser.group, iamUser.policies, iamUser['boundary-policy']);
        }
      }

      const iamRoles = iamConfig.roles;
      for (const iamRole of iamRoles!) {
        if (!IamRoleConfigType.is(iamRole)) {
          console.log(
            `IAM config - roles is not defined for account with key - ${accountKey}. Skipping Roles creation.`,
          );
        } else {
          createIamRole(
            iamRole.role,
            iamRole.type,
            iamRole.policies,
            iamRole['boundary-policy'],
            iamRole['source-account'],
            iamRole['source-account-role'],
            iamRole['trust-policy'],
          );
        }
      }
    }

    // create IAM access analyzer in only security account
    // note: security account delegated as access analyzer administrator in previous step
    if (accountKey === 'security') {
      const accessAnalyzer = new accessanalyzer.CfnAnalyzer(this, 'OrgAccessAnalyzer', {
        analyzerName: 'OrgAccessAnalyzer',
        type: 'ORGANIZATION',
      });
    }

    // TODO Below code and flowLogBucket code are almost similar. We need to reuse the code.
    // cost and usage report
    if (accountKey === 'master') {
      // kms key used for s3 bucket encryption
      const encryptionKey = new kms.Key(this, 'EncryptionKey', {
        alias: 'alias/' + AcceleratorNameGenerator.generate('S3DefaultKey'),
        description: 'PBMM - Key used to encrypt/decrypt S3 bucket by default',
      });

      let replicationRole: iam.Role | undefined;
      let replicationConfiguration: s3.CfnBucket.ReplicationConfigurationProperty | undefined;
      if (replication) {
        // Create a role that will be able to replicate to the log-archive bucket
        replicationRole = new iam.Role(this, 'ReplicationRole', {
          assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
        });

        // Allow the replication role to replicate objects to the log archive bucket
        replicationRole.addToPolicy(
          new iam.PolicyStatement({
            actions: [
              's3:ReplicateObject',
              's3:ReplicateDelete',
              's3:ReplicateTags',
              's3:GetObjectVersionTagging',
              's3:ObjectOwnerOverrideToBucketOwner',
            ],
            resources: [replication.bucketArn, `${replication.bucketArn}/*`],
          }),
        );

        // Allow the replication role to encrypt using the log archive KMS key
        replicationRole.addToPolicy(
          new iam.PolicyStatement({
            actions: ['kms:Encrypt'],
            resources: [replication.kmsKeyArn],
          }),
        );

        // Grant access for the ReplicationRole to read and write
        encryptionKey.grantEncryptDecrypt(replicationRole);

        // This is the replication configuration that will be used for the S3 bucket
        replicationConfiguration = {
          role: replicationRole.roleArn,
          rules: [
            {
              id: 'PBMMAccel-s3-replication-rule-1',
              status: 'Enabled',
              prefix: '',
              sourceSelectionCriteria: {
                sseKmsEncryptedObjects: {
                  status: 'Enabled',
                },
              },
              destination: {
                bucket: replication.bucketArn,
                account: replication.accountId,
                encryptionConfiguration: {
                  replicaKmsKeyId: replication.kmsKeyArn,
                },
                storageClass: 'STANDARD',
                accessControlTranslation: {
                  owner: 'Destination',
                },
              },
            },
          ],
        };
      }

      // s3 bucket to collect cost and usage reports
      const s3Bucket = new s3.CfnBucket(this, 's3BucketCfn', {
        bucketName: s3BucketNameForCur,
        publicAccessBlockConfiguration: {
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true,
        },
        versioningConfiguration: {
          status: 'Enabled',
        },
        bucketEncryption: {
          serverSideEncryptionConfiguration: [
            {
              serverSideEncryptionByDefault: {
                sseAlgorithm: 'aws:kms',
                kmsMasterKeyId: encryptionKey.keyId,
              },
            },
          ],
        },
        lifecycleConfiguration: {
          rules: [
            {
              id: 'PBMMAccel-s3-life-cycle-policy-rule-1',
              status: 'Enabled',
              abortIncompleteMultipartUpload: {
                daysAfterInitiation: 7,
              },
              expirationInDays,
              noncurrentVersionExpirationInDays: expirationInDays,
            },
          ],
        },
        replicationConfiguration,
      });

      const s3BucketPolicy = new s3.CfnBucketPolicy(this, 's3BucketConstruct', {
        bucket: s3Bucket.bucketName!,
        policyDocument: {
          Version: '2008-10-17',
          Statement: [
            {
              Sid: 'Allow billing reports to check bucket policy',
              Effect: 'Allow',
              Principal: {
                Service: 'billingreports.amazonaws.com',
              },
              Action: ['s3:GetBucketAcl', 's3:GetBucketPolicy'],
              Resource: `${s3Bucket.attrArn}`,
            },
            {
              Sid: 'Allow billing reports to add reports to bucket',
              Effect: 'Allow',
              Principal: {
                Service: 'billingreports.amazonaws.com',
              },
              Action: 's3:PutObject',
              Resource: `${s3Bucket.attrArn}/*`,
            },
          ],
        },
      });

      if (replication) {
        // Grant the replication role the actions to replicate the objects in the bucket
        replicationRole!.addToPolicy(
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
            resources: [s3Bucket.attrArn, `${s3Bucket.attrArn}/*`],
          }),
        );
      }
    }
  }
}
