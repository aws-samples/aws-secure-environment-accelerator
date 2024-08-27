# Customer Managed Keys - Comparison of ASEA and LZA

There are differences between how ASEA and LZA manage AWS KMS keys to provide encryption at rest capabilities for resources deployed by the solution. In general, LZA uses more granular keys for each service as well as configuration options to control where the keys are deployed. Some AWS KMS keys are deployed to every account and Region managed by the solution, while others are centralized in a single core account.

This document provides details about important differences between the management of keys by ASEA and LZA and how the different keys are handled during the upgrade.

Refer to the [Key management](https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/key-management.html) section of the **Landing Zone Accelerator on AWS Implementation Guide** for more details on the configuration options for AWS KMS keys offered by LZA.

## General approach
- In general the upgrade process aims to align the usage of Customer Managed Keys (CMK) to the default LZA configuration
- In existing accounts you may see the existence of ASEA created keys AND LZA created keys
- New AWS accounts created after the upgrade will only have LZA created keys
- For cases where the LZA configuration supports `deploymentTargets` for keys, the convert-config process generates a configuration to create CMKs in regions with VPCs (which in most cases corresponds to the home region AND additional regions identified to deploy workloads).  Customers can choose to modify this configuration to suit theirs needs.
- The upgrade process never schedules the deletion of an existing key. In most cases existing ASEA keys need to be kept for as long as there is data encrypted with the key. When applicable, we provide guidance on specific use cases where older keys can be manually deleted by the customer if they choose to.

## Key specifics details

### S3/Bucket key
ASEA: Creates a `Bucket-Key` in all accounts in the home region. This key is used for other resources as well (see references below)

LZA: Creates an `s3` key in all accounts and regions to encrypt Amazon S3 buckets created by the solution. Deployment of the key can be controlled using deploymentTargets in the configuration. (ref: [S3GlobalConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/classes/_aws_accelerator_config.S3GlobalConfig.html))

Upgrade: The convert-config process generates a configuration to create a LZA `s3` key in all accounts and in regions which have VPCs deployed. The existing ASEA `Bucket-Key` in existing accounts is kept and needed to provide access to data already encrypted using the key. New AWS accounts created after the upgrade will only have the LZA `s3` key.

#### Central Logging bucket
ASEA: Uses the `Bucket-Key` in the Log Archive account

LZA: Creates a `central-logs/s3` in the Log Archive account

Upgrade: The existing central logging bucket in the Log Archive account is [imported](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/classes/_aws_accelerator_config.CentralLogBucketConfig.html#importedBucket) during the upgrade process. The existing ASEA `Bucket-Key` from the Log Archive account continues to be used to encrypt existing and new data stored on the central logging bucket.

### CloudWatch
ASEA: Uses service managed keys for CloudWatch encryption

LZA: Creates a `cloudwatch` key in all accounts and regions used to encrypt CloudWatch Logs groups created by the solution. Deployment of the key can be controlled using deploymentTargets in the configuration (ref: [CloudWatchLogsConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/classes/_aws_accelerator_config.CloudWatchLogsConfig.html#encryption))

Upgrade: The convert-config process generates a configuration to create a LZA `cloudwatch` key in all accounts and in regions which have VPCs deployed.

### SNS Topics
ASEA: Uses the bucket key to encrypt SNS topics

LZA: Creates a dedicated `snstopic` key in accounts where notification SNS topics are deployed

Upgrade: SNS Topics are deployed to the Management and Audit accounts and a dedicated `snstopic` key is deployed in those accounts.

### Lambda
ASEA: Uses service managed keys for Lambda environment variables encryption

LZA: Creates a `lambda` key used to encrypt environment variables for Lambda functions created by the solution. Deployment of the key can be controlled using deploymentTargets in the configuration (ref: [LambdaConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/latest/classes/_aws_accelerator_config.LambdaConfig.html))

Upgrade: The convert-config process generates a configuration that don't create keys for Lambda. Service managed keys will continue to be used for Lambda environment variables encryption. You can opt-in to have LZA create Customer Managed Keys by modifying the LZA configuration.

### EBS
ASEA: Creates a `EBS-Key` in all regions with VPCs

LZA: Controlled by the [EbsDefaultVolumeEncryptionConfig](https://awslabs.github.io/landing-zone-accelerator-on-aws/latest/typedocs/v1.7.0/classes/_aws_accelerator_config.EbsDefaultVolumeEncryptionConfig.html) in security-config.yaml to be used for default encryption of Amazon EBS volumes.

Upgrade: The convert-config process generates a configuration to create a LZA `ebs/default-encryption` key in all accounts and regions which have VPCs deployed. The existing ASEA `EBS-Key` is kept in existing accounts for existing volumes and snapshot encrypted by the key. New volumes created after the upgrade will use the LZA `ebs/default-encryption` key by default.

Post-upgrade: Customers can decide to manually remove the ASEA `EBS-Key` from individual accounts once they confirm that no volumes, snapshots or other data and resources is using the key.  **Deleting an AWS KMS key is destructive and potentially dangerous. It deletes the key material and all metadata associated with the KMS key and is irreversible. After a KMS key is deleted, you can no longer decrypt the data that was encrypted under that KMS key, which means that data becomes unrecoverable.**. Refer to AWS documentation on [Deleting AWS KMS keys](https://docs.aws.amazon.com/kms/latest/developerguide/deleting-keys.html) for more information.

### System Manager Session Manager
ASEA: Creates a `SSM-Key` in all regions and accounts with VPCs. This key is used to encrypt Session Manager sessions AND the Session Manager Log Group

LZA: Creates a `sessionmanager-logs/session` key to encrypt Session Manager sessions if Session Manager logging is activated in the global-config.yaml file. In all accounts and regions. Uses the CloudWatch key to encrypt Session Manager Log Group.

Upgrade: Create `sessionmanager-logs/session` key to encrypt Session Manager sessions in all accounts and all regions with VPCs. The `CloudWatch` key is used to encrypt Session Manager Log Group.

Post-upgrade: Customers can decide to manually remove the ASEA `SSM-Key` from individual accounts once they confirm that not CloudWatch logs or other data and resources is using the key. The Session Manager sessions data is short-lived, however the `SSM-Key` is also used to encrypt the `/[<accelerator-prefix</SSM` Log Group. Deleting the key will prevent access to existing logs in this Log Group. Only delete the key once you confirm you no longer need access to the data from this log group according to your retention policy. Note that all Cloud Watch Log Groups logs are also delivered to the central logging bucket for long term retention. The central logging bucket uses the `ASEA-Bucket` key for encryption. **Deleting an AWS KMS key is destructive and potentially dangerous. It deletes the key material and all metadata associated with the KMS key and is irreversible. After a KMS key is deleted, you can no longer decrypt the data that was encrypted under that KMS key, which means that data becomes unrecoverable.** Refer to AWS documentation on [Deleting AWS KMS keys](https://docs.aws.amazon.com/kms/latest/developerguide/deleting-keys.html) for more information.