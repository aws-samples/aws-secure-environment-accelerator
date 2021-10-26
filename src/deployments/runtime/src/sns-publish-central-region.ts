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

import { SNS } from '@aws-accelerator/common/src/aws/sns';
import { SNSEvent, Context } from 'aws-lambda';

const logCentralRegion = process.env.CENTRAL_LOG_SERVICES_REGION!;
const logCentralAccount = process.env.CENTRAL_LOG_ACCOUNT!;
const sns = new SNS(undefined, logCentralRegion);

export const handler = async (input: SNSEvent, context: Context): Promise<void> => {
  console.log('Verifying Account Creation status ....');
  console.log(JSON.stringify(input, null, 2));
  const snsNotificationConfig = input.Records[0].Sns;
  const topicArn = snsNotificationConfig.TopicArn;
  const topicName = topicArn.split(':').pop();
  await sns.publish({
    Message: snsNotificationConfig.Message,
    Subject: snsNotificationConfig.Subject,
    TopicArn: `arn:aws:sns:${logCentralRegion}:${logCentralAccount}:${topicName}`,
  });
};
