// all accounts
export const OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION = 'KmsKeyIdForEbsDefaultEncryption';
export const OUTPUT_KMS_KEY_ID_FOR_SSM_SESSION_MANAGER = 'KmsKeyIdForSSMSessionManager';
export const AWS_LANDING_ZONE_CLOUD_TRAIL_NAME = 'AWS-Landing-Zone-BaselineCloudTrail';
export const ACM_CERT_ARN_SECRET_ID_FORMAT = 'accelerator/xxaccountKeyxx/acm/xxcertNamexx';

// log-archive account
export const OUTPUT_LOG_ARCHIVE_ACCOUNT_ID = 'LogArchiveAccountId';
export const OUTPUT_LOG_ARCHIVE_BUCKET_ARN = 'LogArchiveBucketArn';
export const OUTPUT_LOG_ARCHIVE_BUCKET_NAME = 'LogArchiveBucketName';
export const OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN = 'LogArchiveEncryptionKey';

export interface MadRuleOutput {
  [key: string]: string;
}

export interface ResolverRulesOutput {
  onPremRules?: string[];
  inBoundRule?: string;
  madRules?: MadRuleOutput;
}

export interface ResolversOutput {
  vpcName: string;
  inBound?: string;
  outBound?: string;
  rules?: ResolverRulesOutput;
}

export interface VpcSubnetOutput {
  subnetId: string;
  subnetName: string;
  az: string;
  cidrBlock: string;
}

export interface VpcSecurityGroupOutput {
  securityGroupId: string;
  securityGroupName: string;
}

export interface VpcOutput {
  vpcId: string;
  vpcName: string;
  cidrBlock: string;
  subnets: VpcSubnetOutput[];
  routeTables: { [key: string]: string };
  securityGroups: VpcSecurityGroupOutput[];
}

export interface SecurityGroupsOutput {
  vpcId: string;
  vpcName: string;
  securityGroupIds: VpcSecurityGroupOutput[];
}
