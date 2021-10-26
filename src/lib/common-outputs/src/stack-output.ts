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

import { VpcSecurityGroupOutput } from './vpc';

// all accounts
export const OUTPUT_KMS_KEY_ID_FOR_SSM_SESSION_MANAGER = 'KmsKeyIdForSSMSessionManager';
export const OUTPUT_KMS_KEY_ARN_FOR_SSM_SESSION_MANAGER = 'KmsKeyArnForSSMSessionManager';
export const OUTPUT_CLOUDWATCH_LOG_GROUP_FOR_SSM_SESSION_MANAGER = 'CWLForSSMSessionManager';
export const AWS_CONTROL_TOWER_CLOUD_TRAIL_NAME = 'aws-controltower-BaselineCloudTrail';
export const ACM_CERT_ARN_SECRET_ID_FORMAT = 'accelerator/xxaccountKeyxx/acm/xxcertNamexx';

// log-archive account
export const OUTPUT_LOG_ARCHIVE_ACCOUNT_ID = 'LogArchiveAccountId';
export const OUTPUT_LOG_ARCHIVE_BUCKET_ARN = 'LogArchiveBucketArn';
export const OUTPUT_LOG_ARCHIVE_BUCKET_NAME = 'LogArchiveBucketName';
export const OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN = 'LogArchiveEncryptionKey';

// AMI Market place Subscription check
export const OUTPUT_SUBSCRIPTION_REQUIRED = 'OptInRequired';
export const OUTPUT_SUBSCRIPTION_DONE = 'Subscribed';

// Regular expression of ALB name allowed characters
export const ALB_NAME_REGEXP = /^[A-Za-z0-9-]*$/;

export interface StackOutput {
  accountKey: string;
  region: string;
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
  region?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getStackJsonOutput(outputs: StackOutput[], filter: StackJsonOutputFilter = {}): any[] {
  return outputs
    .map(output => {
      if (filter.accountKey && output.accountKey !== filter.accountKey) {
        return null;
      }
      if (filter.region && output.region !== filter.region) {
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
        // eslint-disable-next-line no-empty
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
  madRules?: string[];
}

export interface ResolversOutput {
  vpcName: string;
  accountKey: string;
  region: string;
  inBound?: string;
  outBound?: string;
  rules?: ResolverRulesOutput;
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
