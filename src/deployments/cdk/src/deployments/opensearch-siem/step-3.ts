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
import * as s3 from '@aws-cdk/aws-s3';
import { StructuredOutput } from '../../common/structured-output';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { S3BucketNotifications } from '@aws-accelerator/custom-resource-s3-bucket-notifications';
import { OpenSearchLambdaProcessingArnOutput } from './outputs';

export interface OpenSearchSIEMStep3Props {
  acceleratorPrefix: string;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];  
  logArchiveBucket: s3.IBucket;  
  aesLogArchiveBucket: s3.IBucket;
}

export async function step3(props: OpenSearchSIEMStep3Props) {
  const { acceleratorPrefix, accountStacks, config, outputs, logArchiveBucket, aesLogArchiveBucket } = props;

  for (const [accountKey, accountConfig] of config.getMandatoryAccountConfigs()) {
    const openSearchSIEMDeploymentConfig = accountConfig.deployments?.siem;
    if (!openSearchSIEMDeploymentConfig || !openSearchSIEMDeploymentConfig.deploy) {
      continue;
    }
    
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const logAccountConfig = config['global-options']['central-log-services'];
    const logAccountStack = accountStacks.tryGetOrCreateAccountStack(logAccountConfig.account);  
    if (!logAccountStack) {
      console.warn(`Cannot find account stack ${logAccountStack}`);
      continue;
    }

    const processingLambdaArn = StructuredOutput.fromOutputs(outputs, {
      accountKey,
      type: OpenSearchLambdaProcessingArnOutput,
    });

    if (processingLambdaArn.length !== 1) {
      console.warn(`Cannot find required processing lambda function arn in account "${accountKey}"`);
      return;
    }
    const lambdaArn = processingLambdaArn[0].lambdaArn;

    configureS3LoggingNotifications(
      logArchiveBucket,
      aesLogArchiveBucket,
      lambdaArn,
      acceleratorPrefix
    );

  }
}

export function configureS3LoggingNotifications(   
  logArchiveBucket: s3.IBucket,
  aesLogArchiveBucket: s3.IBucket,
  lambdaArn: string,
  acceleratorPrefix: string
) {
  
  for (const bucket of [aesLogArchiveBucket, logArchiveBucket]) {    
    new S3BucketNotifications(bucket.stack, `S3Notifications${bucket.bucketName}`, {
      bucketName: bucket.bucketName,
      lambdaArn: lambdaArn,
      s3Events: ["s3:ObjectCreated:Put", "s3:ObjectCreated:Post"],
      s3EventName: `${acceleratorPrefix}SIEM-SendToLambda`
    });
  }
     
}
