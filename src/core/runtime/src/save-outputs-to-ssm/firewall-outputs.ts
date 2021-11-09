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
import { FirewallConfigReplacementsOutputFinder } from '@aws-accelerator/common-outputs/src/firewall';

const OUTPUT_TYPE = 'firewall';
interface OutputUtilFireallReplacements extends OutputUtilGenericType {
  replacements: string[];
}
interface OutputUtilFirewall {
  firewalls?: OutputUtilFireallReplacements[];
}

/**
 * Outputs for Firewall Replacement related deployments will be found in following phases
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
export async function saveFirewallReplacementOutputs(props: SaveOutputsInput) {
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

  const dataKey = `${account.key}-${region}-firewall`;
  const removeNames: string[] = [];

  const accountConfig = config.getAccountByKey(account.key);
  if (!accountConfig.deployments || !accountConfig.deployments.firewalls) {
    return;
  }

  if (!accountConfig.deployments.firewalls.find(f => f.region === region)) {
    return;
  }
  const oldFirewallOutputUtils = await getIndexOutput(outputUtilsTableName, dataKey, dynamodb);
  // Existing index check happens on this variable
  let outputUtils: OutputUtilFirewall;
  if (oldFirewallOutputUtils) {
    outputUtils = oldFirewallOutputUtils;
  } else {
    outputUtils = {};
  }
  if (!outputUtils.firewalls) {
    outputUtils.firewalls = [];
  }

  // Storing new resource index and updating DDB in this variable
  const newOutputUtils: OutputUtilFirewall = {};
  newOutputUtils.firewalls = [];

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const ssm = new SSM(credentials, region);

  const outputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${region}-2`, dynamodb);
  const firewallOutputs = FirewallConfigReplacementsOutputFinder.findAll({
    outputs,
    accountKey: account.key,
    region,
  });

  const indices = outputUtils.firewalls.flatMap(e => e.index) || [];
  let maxIndex = indices.length === 0 ? 0 : Math.max(...indices);

  for (const output of firewallOutputs) {
    let currentIndex: number;
    const previousIndex = outputUtils.firewalls.findIndex(f => f.name === output.instanceId);
    if (previousIndex >= 0) {
      currentIndex = outputUtils.firewalls[previousIndex].index;
    } else {
      currentIndex = ++maxIndex;
    }
    newOutputUtils.firewalls.push({
      index: currentIndex,
      name: output.instanceId,
      replacements: Object.keys(output.replacements),
    });

    if (previousIndex < 0) {
      await ssm.putParameter(
        `/${acceleratorPrefix}/${OUTPUT_TYPE}/${output.name}/${currentIndex}/name`,
        `${output.name}`,
      );
      for (const [key, value] of Object.entries(output.replacements)) {
        await ssm.putParameter(
          `/${acceleratorPrefix}/${OUTPUT_TYPE}/${output.name}/${currentIndex}/${key}`,
          `${value}`,
        );
      }
    } else {
      const previousReplacements = outputUtils.firewalls[previousIndex].replacements;
      const currentReplacements = Object.keys(output.replacements);
      for (const replacement of currentReplacements.filter(cr => !previousReplacements.includes(cr))) {
        await ssm.putParameter(
          `/${acceleratorPrefix}/${OUTPUT_TYPE}/${output.name}/${currentIndex}/${replacement}`,
          `${output.replacements[replacement]}`,
        );
      }

      removeNames.push(
        ...previousReplacements
          .filter(pr => !currentReplacements.includes(pr))
          .map(r => `/${acceleratorPrefix}/${OUTPUT_TYPE}/${output.name}/${currentIndex}/${r}`),
      );
    }
    if (previousIndex >= 0) {
      outputUtils.firewalls.splice(previousIndex, 1);
    }
  }

  await saveIndexOutput(outputUtilsTableName, dataKey, JSON.stringify(newOutputUtils), dynamodb);
  removeNames.push(
    ...outputUtils.firewalls
      .map(e => [
        `/${acceleratorPrefix}/${OUTPUT_TYPE}/${e.name}/${e.index}/name`,
        ...e.replacements.map(r => `/${acceleratorPrefix}/${OUTPUT_TYPE}/${e.name}/${e.index}/${r}`),
      ])
      .flatMap(es => es),
  );
  while (removeNames.length > 0) {
    await ssm.deleteParameters(removeNames.splice(0, 10));
  }
}
