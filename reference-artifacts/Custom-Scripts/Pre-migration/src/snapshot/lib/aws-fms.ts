/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { FMSClient, GetNotificationChannelCommand } from '@aws-sdk/client-fms';
import { AwsCredentialIdentity } from '@aws-sdk/types';

import { SnapshotData } from '../common/types';
import { computeHash } from '../common/hash';
import { throttlingBackOff } from '../../common/aws/backoff';

const stringify = require('fast-json-stable-stringify');

export async function getFmsNotificationChannel(
  region: string,
  credentials: AwsCredentialIdentity | undefined,
): Promise<SnapshotData> {
  let serviceClient: FMSClient;
  if (credentials) {
    serviceClient = new FMSClient({ region: region, credentials: credentials });
  } else {
    serviceClient = new FMSClient({ region: region });
  }

  let jsonResults = '{}';
  try {
    const notificationChannelResult = await throttlingBackOff(() =>
      serviceClient.send(new GetNotificationChannelCommand({})),
    );
    jsonResults = stringify(
      {
        SnsRoleName: notificationChannelResult.SnsRoleName,
        SnsTopicArn: notificationChannelResult.SnsTopicArn,
      },
      { space: 1 },
    );
  } catch (e: any) {
    if (e.name === 'AccessDeniedException') {
      // do nothing if access exception
    } else {
      console.log(JSON.stringify(e));
      throw new Error('Failed to get FMS notification channel');
    }
  }

  const hash = computeHash(jsonResults);
  return { jsonData: jsonResults, hash: hash };
}
