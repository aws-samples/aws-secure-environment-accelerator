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

import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getOutput, OutputUtilGenericType, SaveOutputsInput, getIndexOutput, saveIndexOutput } from './utils';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { SnsTopicOutputFinder } from '@aws-accelerator/common-outputs/src/sns-topic';

interface OutputUtilEvent {
  events?: OutputUtilGenericType[];
}

/**
 * Outputs for event related deployments will be found in following phases
 * - Phase-2
 */

/**
 *
 * @param outputsTableName
 * @param client
 * @param config
 * @param account
 *
 * @returns void
 */
export async function saveEventOutputs(props: SaveOutputsInput) {
  const {
    acceleratorPrefix,
    account,
    config,
    dynamodb,
    outputsTableName,
    assumeRoleName,
    region,
    outputUtilsTableName,
  } = props;
  const logAccountKey = config.getMandatoryAccountKey('central-log');
  if (account.key !== logAccountKey) {
    console.info('Ignoring storing event ouputs since we only need them in log account');
    return;
  }

  if (config['global-options']['central-log-services']['sns-excl-regions']?.includes(region)) {
    console.info('Ignoring storing event outputs since region is in exclusion list');
    return;
  }
  const oldEventOutputUtils = await getIndexOutput(outputUtilsTableName, `${account.key}-${region}-event`, dynamodb);
  // Existing index check happens on this variable
  let eventOutputUtils: OutputUtilEvent;
  if (oldEventOutputUtils) {
    eventOutputUtils = oldEventOutputUtils;
  } else {
    eventOutputUtils = {};
  }
  if (!eventOutputUtils.events) {
    eventOutputUtils.events = [];
  }

  // Storing new resource index and updating DDB in this variable
  const newEventOutputs: OutputUtilEvent = {};
  newEventOutputs.events = [];

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const ssm = new SSM(credentials, region);

  const outputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${region}-2`, dynamodb);
  const eventOutputs = SnsTopicOutputFinder.findAll({
    outputs,
    accountKey: logAccountKey,
    region,
  });

  const indices = eventOutputUtils.events.flatMap(e => e.index) || [];
  let maxIndex = indices.length === 0 ? 0 : Math.max(...indices);

  for (const eventOutput of eventOutputs) {
    let currentIndex: number;
    const previousIndex = eventOutputUtils.events.findIndex(e => e.name === eventOutput.topicName);
    if (previousIndex >= 0) {
      currentIndex = eventOutputUtils.events[previousIndex].index;
    } else {
      currentIndex = ++maxIndex;
    }
    newEventOutputs.events.push({
      index: currentIndex,
      name: eventOutput.topicName,
    });

    if (previousIndex < 0) {
      await ssm.putParameter(`/${acceleratorPrefix}/event/${currentIndex}/name`, `${eventOutput.topicName}`);
      await ssm.putParameter(`/${acceleratorPrefix}/event/${currentIndex}/arn`, `${eventOutput.topicArn}`);
    }

    if (previousIndex >= 0) {
      eventOutputUtils.events.splice(previousIndex, 1);
    }
  }

  await saveIndexOutput(
    outputUtilsTableName,
    `${account.key}-${region}-event`,
    JSON.stringify(newEventOutputs),
    dynamodb,
  );
  const removeNames = eventOutputUtils.events
    .map(e => [`/${acceleratorPrefix}/event/${e.index}/name`, `/${acceleratorPrefix}/event/${e.index}/arn`])
    .flatMap(es => es);
  while (removeNames.length > 0) {
    await ssm.deleteParameters(removeNames.splice(0, 10));
  }
}
