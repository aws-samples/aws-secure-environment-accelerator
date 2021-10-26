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

import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceDeleteEvent, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const ssm = new AWS.SSM();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Updating SSM Parameter Store throughput...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreateOrUpdate(_: CloudFormationCustomResourceEvent) {
  try {
    await throttlingBackOff(() =>
      ssm
        .updateServiceSetting({
          SettingId: '/ssm/parameter-store/high-throughput-enabled',
          SettingValue: 'true',
        })
        .promise(),
    );
  } catch (error) {
    console.warn('Error while setting limit to ssm parameter store');
    console.warn(error);
  }
  return {
    physicalResourceId: `/ssm/parameter-store/high-throughput-enabled`,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  if (event.PhysicalResourceId === '/ssm/parameter-store/high-throughput-enabled') {
    try {
      await throttlingBackOff(() =>
        ssm
          .updateServiceSetting({
            SettingId: '/ssm/parameter-store/high-throughput-enabled',
            SettingValue: 'false',
          })
          .promise(),
      );
    } catch (error) {
      console.warn('Error while setting limit to ssm parameter store');
      console.warn(error);
    }
  }
}
