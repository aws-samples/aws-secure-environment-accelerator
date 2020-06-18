// all accounts
export const OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION = 'KmsKeyIdForEbsDefaultEncryption';
export const OUTPUT_KMS_KEY_ID_FOR_SSM_SESSION_MANAGER = 'KmsKeyIdForSSMSessionManager';
export const OUTPUT_KMS_KEY_ARN_FOR_SSM_SESSION_MANAGER = 'KmsKeyArnForSSMSessionManager';
export const OUTPUT_CLOUDWATCH_LOG_GROUP_FOR_SSM_SESSION_MANAGER = 'CWLForSSMSessionManager';
export const AWS_LANDING_ZONE_CLOUD_TRAIL_NAME = 'AWS-Landing-Zone-BaselineCloudTrail';
export const ACM_CERT_ARN_SECRET_ID_FORMAT = 'accelerator/xxaccountKeyxx/acm/xxcertNamexx';

// log-archive account
export const OUTPUT_LOG_ARCHIVE_ACCOUNT_ID = 'LogArchiveAccountId';
export const OUTPUT_LOG_ARCHIVE_BUCKET_ARN = 'LogArchiveBucketArn';
export const OUTPUT_LOG_ARCHIVE_BUCKET_NAME = 'LogArchiveBucketName';
export const OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN = 'LogArchiveEncryptionKey';

// AMI Market place Subscription check
export const OUTPUT_SUBSCRIPTION_REQUIRED = 'OptInRequired';
export const OUTPUT_SUBSCRIPTION_DONE = 'Subscribed';

export interface StackOutput {
  accountKey: string;
  outputKey?: string;
  outputValue?: string;
  outputDescription?: string;
  outputExportName?: string;
}

export function getStackOutput(outputs: StackOutput[], accountKey: string, outputKey: string): string | undefined {
  const output = outputs.find(o => o.outputKey === outputKey && o.accountKey === accountKey);
  if (!output) {
    console.warn(`Cannot find output with key "${outputKey}" in account with key "${accountKey}"`);
    return;
  }
  return output.outputValue!;
}

export interface StackJsonOutputFilter {
  accountKey?: string;
  outputType?: string;
}

// tslint:disable-next-line: no-any
export function getStackJsonOutput(outputs: StackOutput[], filter: StackJsonOutputFilter = {}): any[] {
  return outputs
    .map(output => {
      if (filter.accountKey && output.accountKey !== filter.accountKey) {
        return null;
      }
      try {
        if (output.outputValue && output.outputValue.startsWith('{')) {
          const json = JSON.parse(output.outputValue);
          const type = json.type;
          const value = json.value;
          if (!filter.outputType || filter.outputType === type) {
            return value;
          }
        }
      } catch {}
      return null;
    })
    .filter(jsonOutput => !!jsonOutput);
}

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
  additionalCidrBlocks: string[];
  subnets: VpcSubnetOutput[];
  routeTables: { [key: string]: string };
  securityGroups: VpcSecurityGroupOutput[];
}

export interface AmiSubscriptionOutput {
  imageId: string;
  status: string;
}

export interface SecurityGroupsOutput {
  vpcId: string;
  vpcName: string;
  securityGroupIds: VpcSecurityGroupOutput[];
}
