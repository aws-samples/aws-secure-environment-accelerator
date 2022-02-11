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
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceUpdateEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

const hub = new AWS.SecurityHub();

export const handler = errorHandler(onEvent);

interface SecurityHubStandard {
  name: string;
  'controls-to-disable': string[] | undefined;
}

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Disable Security Hub Standards specific controls...`);
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
  const standards = event.ResourceProperties.standards;
  const standardsResponse = await describeStandards();
  const enabledStandardsResponse = await getEnabledStandards();

  // Getting standards and disabling specific Controls for each standard
  for (const standard of standards) {
    const standardArn = standardsResponse?.find(x => x.Name === standard.name)?.StandardsArn;
    const standardSubscriptionArn = enabledStandardsResponse?.find(s => s.StandardsArn === standardArn)
      ?.StandardsSubscriptionArn;

    const standardControls = await describeStandardsControls(standardSubscriptionArn);
    for (const disableControl of standard['controls-to-disable']) {
      const standardControl = standardControls?.find(x => x.ControlId === disableControl);
      if (!standardControl) {
        console.log(`Control "${disableControl}" not found for Standard "${standard.name}"`);
        continue;
      }

      console.log(`Disabling Control "${disableControl}" for Standard "${standard.name}"`);
      await throttlingBackOff(() =>
        hub
          .updateStandardsControl({
            StandardsControlArn: standardControl.StandardsControlArn!,
            ControlStatus: 'DISABLED',
            DisabledReason: 'Control disabled by Accelerator',
          })
          .promise(),
      );
    }
  }

  return {
    physicalResourceId: `SecurityHubEnableControls`,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const standards = event.ResourceProperties.standards as SecurityHubStandard[];
  const oldStandards = event.OldResourceProperties.standards as SecurityHubStandard[];
  const standardNames = standards.map(st => st.name);

  const standardsResponse = await throttlingBackOff(() => hub.describeStandards().promise());
  const enabledStandardsResponse = await throttlingBackOff(() => hub.getEnabledStandards().promise());
  // Getting standards and disabling specific Controls for each standard
  for (const standard of standards) {
    const standardArn = standardsResponse.Standards?.find(x => x.Name === standard.name)?.StandardsArn;
    const standardSubscriptionArn = enabledStandardsResponse.StandardsSubscriptions?.find(
      s => s.StandardsArn === standardArn,
    )?.StandardsSubscriptionArn;

    const standardControls = await describeStandardsControls(standardSubscriptionArn);
    for (const disableControl of standard['controls-to-disable'] || []) {
      const standardControl = standardControls?.find(x => x.ControlId === disableControl);
      if (!standardControl) {
        console.log(`Control "${disableControl}" not found for Standard "${standard.name}"`);
        continue;
      }

      console.log(`Disabling Control "${disableControl}" for Standard "${standard.name}"`);
      await throttlingBackOff(() =>
        hub
          .updateStandardsControl({
            StandardsControlArn: standardControl.StandardsControlArn!,
            ControlStatus: 'DISABLED',
            DisabledReason: 'Control disabled by Accelerator',
          })
          .promise(),
      );
    }
    const oldStandard = oldStandards.find(st => st.name === standard.name);
    if (oldStandard) {
      const enableControls = oldStandard['controls-to-disable']?.filter(
        c => !standard['controls-to-disable']?.includes(c),
      );
      for (const enableControl of enableControls || []) {
        const standardControl = standardControls?.find(x => x.ControlId === enableControl);
        if (!standardControl) {
          console.log(`Control "${enableControl}" not found for Standard "${standard.name}"`);
          continue;
        }
        await throttlingBackOff(() =>
          hub
            .updateStandardsControl({
              StandardsControlArn: standardControl.StandardsControlArn!,
              ControlStatus: 'ENABLED',
            })
            .promise(),
        );
      }
    }
  }
  return {
    physicalResourceId: `SecurityHubEnableControls`,
  };
}

async function describeStandards() {
  const standards = [];
  let token: string | undefined;
  do {
    const response = await throttlingBackOff(() => hub.describeStandards().promise());
    if (response.Standards) {
      standards.push(...response.Standards);
    }
    token = response.NextToken;
  } while (token);

  return standards;
}

async function getEnabledStandards() {
  const enabledStandards = [];
  let token: string | undefined;
  do {
    const response = await throttlingBackOff(() => hub.getEnabledStandards().promise());
    if (response.StandardsSubscriptions) {
      enabledStandards.push(...response.StandardsSubscriptions);
    }
    token = response.NextToken;
  } while (token);

  return enabledStandards;
}

async function describeStandardsControls(subscriptionArn: string | undefined) {
  let token: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const standardControls: any[] = [];
  if (!subscriptionArn) {
    return standardControls;
  }
  do {
    const response = await throttlingBackOff(() =>
      hub.describeStandardsControls({ StandardsSubscriptionArn: subscriptionArn, NextToken: token }).promise(),
    );
    if (response.Controls) {
      standardControls.push(...response.Controls);
    }
    token = response.NextToken;
  } while (token);
  return standardControls;
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
