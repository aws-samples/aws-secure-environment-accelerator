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
import {
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { StandardsSubscriptionRequests } from 'aws-sdk/clients/securityhub';

const hub = new AWS.SecurityHub();

export const handler = errorHandler(onEvent);

interface SecurityHubStandard {
  name: string;
  'controls-to-disable': string[] | undefined;
}

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Enabling Security Hub and Security Hub Standards...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreate(event: CloudFormationCustomResourceEvent) {
  try {
    await throttlingBackOff(() => hub.enableSecurityHub().promise());
  } catch (error) {
    if (error.code === 'ResourceConflictException') {
      console.log('Account is already subscribed to Security Hub');
    } else {
      throw new Error(error);
    }
  }

  const standards = event.ResourceProperties.standards as SecurityHubStandard[];
  const standardsResponse = await throttlingBackOff(() => hub.describeStandards().promise());

  const standardRequests: StandardsSubscriptionRequests = [];
  for (const standard of standards) {
    standardRequests.push({
      StandardsArn: standardsResponse.Standards?.find(x => x.Name === standard.name)?.StandardsArn!,
    });
  }

  await throttlingBackOff(() =>
    hub
      .batchEnableStandards({
        StandardsSubscriptionRequests: standardRequests,
      })
      .promise(),
  );

  return {
    physicalResourceId: `SecurityHubEnable`,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  try {
    await throttlingBackOff(() => hub.enableSecurityHub().promise());
  } catch (error) {
    if (error.code === 'ResourceConflictException') {
      console.log('Account is already subscribed to Security Hub');
    } else {
      throw new Error(error);
    }
  }

  const standardNames = (event.ResourceProperties.standards as SecurityHubStandard[]).map(st => st.name);
  const standardsResponse = await throttlingBackOff(() => hub.describeStandards().promise());

  const oldStandardNames = (event.OldResourceProperties.standards as SecurityHubStandard[]).map(st => st.name);

  const removedStandards = oldStandardNames.filter(st => !standardNames.includes(st));

  const standardRequests: StandardsSubscriptionRequests = [];
  for (const standard of standardNames) {
    standardRequests.push({
      StandardsArn: standardsResponse.Standards?.find(x => x.Name === standard)?.StandardsArn!,
    });
  }

  await throttlingBackOff(() =>
    hub
      .batchEnableStandards({
        StandardsSubscriptionRequests: standardRequests,
      })
      .promise(),
  );

  // Disable standards based on change
  if (removedStandards.length > 0) {
    const getEnabledStandards = await throttlingBackOff(() => hub.getEnabledStandards().promise());
    const enabledStandardArns = standardsResponse.Standards?.filter(st => removedStandards.includes(st.Name!)).map(
      x => x.StandardsArn,
    );
    const enabledStandardSubscriptionsArns = getEnabledStandards.StandardsSubscriptions?.filter(st =>
      enabledStandardArns?.includes(st.StandardsArn),
    ).map(x => x.StandardsSubscriptionArn);
    await throttlingBackOff(() =>
      hub
        .batchDisableStandards({
          StandardsSubscriptionArns: enabledStandardSubscriptionsArns!,
        })
        .promise(),
    );
  }

  return {
    physicalResourceId: `SecurityHubEnable`,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  if (event.PhysicalResourceId !== 'SecurityHubEnable') {
    return;
  }
  const standardNames = (event.ResourceProperties.standards as SecurityHubStandard[]).map(st => st.name);

  const allStandardsResponse = await throttlingBackOff(() => hub.describeStandards().promise());
  // Disable standards based on change
  if (standardNames.length > 0) {
    const getEnabledStandards = await throttlingBackOff(() => hub.getEnabledStandards().promise());
    const enabledStandardArns = allStandardsResponse.Standards?.filter(st => standardNames.includes(st.Name!)).map(
      x => x.StandardsArn,
    );
    const enabledStandardSubscriptionsArns = getEnabledStandards.StandardsSubscriptions?.filter(st =>
      enabledStandardArns?.includes(st.StandardsArn),
    ).map(x => x.StandardsSubscriptionArn);

    await throttlingBackOff(() =>
      hub
        .batchDisableStandards({
          StandardsSubscriptionArns: enabledStandardSubscriptionsArns!,
        })
        .promise(),
    );
  }
}
