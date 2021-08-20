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

import * as aws from 'aws-sdk';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import {
  getStackOutput,
  AWS_CONTROL_TOWER_CLOUD_TRAIL_NAME,
  OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN,
} from '@aws-accelerator/common-outputs/src/stack-output';
import { CloudTrail } from '@aws-accelerator/common/src/aws/cloud-trail';
import { PutEventSelectorsRequest, UpdateTrailRequest } from 'aws-sdk/clients/cloudtrail';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { loadOutputs } from './utils/load-outputs';
import { loadAccounts } from './utils/load-accounts';

interface AccountDefaultSettingsInput extends LoadConfigurationInput {
  assumeRoleName: string;
  outputTableName: string;
  parametersTableName: string;
}

const dynamodb = new DynamoDB();

export const handler = async (input: AccountDefaultSettingsInput) => {
  console.log('Setting account level defaults for all accounts in an organization ...');
  console.log(JSON.stringify(input, null, 2));

  const {
    assumeRoleName,
    configRepositoryName,
    configFilePath,
    configCommitId,
    outputTableName,
    parametersTableName,
    baseline,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const logAccountKey = acceleratorConfig.getMandatoryAccountKey('central-log');

  const outputs = await loadOutputs(outputTableName, dynamodb);
  const accounts = await loadAccounts(parametersTableName, dynamodb);

  const sts = new STS();

  const updateCloudTrailSettings = async (accountId: string, accountKey: string): Promise<void> => {
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);

    const cloudTrailName = AWS_CONTROL_TOWER_CLOUD_TRAIL_NAME;
    console.log('AWS LZ CloudTrail Name: ' + cloudTrailName);

    const logArchiveAccount = accounts.find(a => a.key === logAccountKey);
    if (!logArchiveAccount) {
      console.warn('Cannot find account with type log-archive');
      return;
    }
    const s3KmsKeyArn = getStackOutput(outputs, logAccountKey, OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN);
    console.log('AWS LZ CloudTrail S3 Bucket KMS Key ARN: ' + s3KmsKeyArn);

    const cloudTrail = new CloudTrail(credentials);

    const putInsightSelectorsResponse = await cloudTrail.putInsightSelectors(cloudTrailName);
    console.log('putInsightSelectorsResponse: ', putInsightSelectorsResponse);
    console.log(`Cloud Trail - Insights enabled for AWS LZ CloudTrail in account - ${accountKey}`);

    const trailNameList: string[] = [];
    trailNameList.push(cloudTrailName);
    const describeTrailsResponse = await cloudTrail.describeTrails(false, trailNameList);
    console.log('describeTrailsResponse: ', describeTrailsResponse);

    if (!describeTrailsResponse.trailList) {
      console.warn(`CloudTrail not found with name "${cloudTrailName}"`);
      return;
    }
    let cloudTrailDetails;
    for (const trailList of describeTrailsResponse.trailList) {
      cloudTrailDetails = trailList;
    }

    const putEventSelectorsRequest: PutEventSelectorsRequest = {
      EventSelectors: [
        {
          DataResources: [
            {
              Type: 'AWS::S3::Object',
              Values: ['arn:aws:s3:::'],
            },
          ],
          ExcludeManagementEventSources: [],
          IncludeManagementEvents: true,
          ReadWriteType: 'All',
        },
      ],
      TrailName: AWS_CONTROL_TOWER_CLOUD_TRAIL_NAME,
    };
    const putEventSelectorsResponse = await cloudTrail.putEventSelectors(putEventSelectorsRequest);
    console.log('putEventSelectorsResponse: ', putEventSelectorsResponse);
    console.log(`Cloud Trail - S3 Object Level Logging enabled for AWS LZ CloudTrail in account - ${accountKey}`);

    const updateTrailRequest: UpdateTrailRequest = {
      Name: cloudTrailName,
      CloudWatchLogsLogGroupArn: cloudTrailDetails?.CloudWatchLogsLogGroupArn,
      CloudWatchLogsRoleArn: cloudTrailDetails?.CloudWatchLogsRoleArn,
      EnableLogFileValidation: cloudTrailDetails?.LogFileValidationEnabled,
      IncludeGlobalServiceEvents: cloudTrailDetails?.IncludeGlobalServiceEvents,
      IsMultiRegionTrail: cloudTrailDetails?.IsMultiRegionTrail,
      IsOrganizationTrail: cloudTrailDetails?.IsOrganizationTrail,
      KmsKeyId: s3KmsKeyArn,
      S3BucketName: cloudTrailDetails?.S3BucketName,
      S3KeyPrefix: cloudTrailDetails?.S3KeyPrefix,
      SnsTopicName: cloudTrailDetails?.SnsTopicName,
    };
    const updateTrailResponse = await cloudTrail.updateTrail(updateTrailRequest);
    console.log(`Cloud Trail - settings updated (encryption...) for AWS LZ CloudTrail in account - ${accountKey}`);
  };

  const accountConfigs = acceleratorConfig.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const account = accounts.find(a => a.key === accountKey);
    if (!account) {
      console.warn(`Cannot find account with key "${accountKey}"`);
      continue;
    }

    // if (baseline === 'CONTROL_TOWER') {
    //   try {
    //     // update AWS LZ cloud trail settings
    //     await updateCloudTrailSettings(account.id, account.key);
    //   } catch (e) {
    //     console.error(`Error while updating CloudTrail settings`);
    //     console.error(e);
    //   }
    // }
  }

  return {
    status: 'SUCCESS',
    statusReason: 'Successfully defaults set at account level for all accounts in an organization.',
  };
};
