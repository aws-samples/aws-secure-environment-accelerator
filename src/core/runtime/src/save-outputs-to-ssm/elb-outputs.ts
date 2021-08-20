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
import { LoadBalancerOutputFinder, LoadBalancerOutput } from '@aws-accelerator/common-outputs/src/elb';
import { Account, getAccountId } from '@aws-accelerator/common-outputs/src/accounts';

interface OutputUtilLbType extends OutputUtilGenericType {
  account: string;
}
interface OutputUtilElb {
  albs?: OutputUtilLbType[];
  nlbs?: OutputUtilLbType[];
}

/**
 * Outputs for elb related deployments will be found in following phases
 * - Phase-3
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
export async function saveElbOutputs(props: SaveOutputsInput) {
  const {
    acceleratorPrefix,
    account,
    config,
    dynamodb,
    outputsTableName,
    assumeRoleName,
    region,
    outputUtilsTableName,
    accounts,
  } = props;
  const oldElbOutputUtils = await getIndexOutput(outputUtilsTableName, `${account.key}-${region}-lelb`, dynamodb);
  // Existing index check happens on this variable
  let elbOutputUtils: OutputUtilElb;
  if (oldElbOutputUtils) {
    elbOutputUtils = oldElbOutputUtils;
  } else {
    elbOutputUtils = {
      albs: [],
      nlbs: [],
    };
  }

  // Storing new resource index and updating DDB in this variable
  const newElbOutputs: OutputUtilElb = {
    albs: [],
    nlbs: [],
  };

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const ssm = new SSM(credentials, region);

  const localOutputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${region}-3`, dynamodb);
  const elbOutputs = LoadBalancerOutputFinder.findAll({
    outputs: localOutputs,
    accountKey: account.key,
    region,
  });
  const nlbOutputs = elbOutputs.filter(elb => elb.type === 'NETWORK');
  const albOutputs = elbOutputs.filter(elb => elb.type === 'APPLICATION');
  newElbOutputs.nlbs = (
    await saveElbOutputsImpl({
      acceleratorPrefix,
      lbOutputs: nlbOutputs,
      lbUtil: elbOutputUtils.nlbs || [],
      ssm,
      type: 'nlb',
      accountKey: account.key,
      source: 'local',
      accounts: accounts!,
    })
  ).lbs;

  newElbOutputs.albs = (
    await saveElbOutputsImpl({
      acceleratorPrefix,
      lbOutputs: albOutputs,
      lbUtil: elbOutputUtils.albs || [],
      ssm,
      type: 'alb',
      accountKey: account.key,
      source: 'local',
      accounts: accounts!,
    })
  ).lbs;

  await saveIndexOutput(outputUtilsTableName, `${account.key}-${region}-lelb`, JSON.stringify(newElbOutputs), dynamodb);

  const accountConfigAndKey = config.getAccountConfigs().find(([accountKey, _]) => accountKey === account.key);
  if (!accountConfigAndKey) {
    return;
  }
  const accountConfig = accountConfigAndKey[1];
  if (!accountConfig['populate-all-elbs-in-param-store']) {
    return;
  }

  const additionalNlbAccountKeys = config
    .getRsysLogConfigs()
    .filter(lb => lb.accountKey !== account.key)
    .map(al => al.accountKey);
  const additionalAlbAccountKeys = config
    .getElbConfigs()
    .filter(lb => lb.accountKey !== account.key)
    .map(al => al.accountKey);
  const additionalAccountKeys = Array.from(new Set([...additionalNlbAccountKeys, ...additionalAlbAccountKeys]));

  const remoteOldElbOutputUtils = await getIndexOutput(outputUtilsTableName, `${account.key}-${region}-elb`, dynamodb);
  // Existing index check happens on this variable
  let remoteElbOutputUtils: OutputUtilElb;
  if (remoteOldElbOutputUtils) {
    remoteElbOutputUtils = remoteOldElbOutputUtils;
  } else {
    remoteElbOutputUtils = {};
  }
  if (!remoteElbOutputUtils.albs) {
    remoteElbOutputUtils.albs = [];
  }
  if (!remoteElbOutputUtils.nlbs) {
    remoteElbOutputUtils.nlbs = [];
  }

  const previousNlbAccountKeys = Array.from(new Set([...(remoteElbOutputUtils.nlbs.flatMap(al => al.account) || [])]));
  const previousAlbAccountKeys = Array.from(new Set([...(remoteElbOutputUtils.albs.flatMap(al => al.account) || [])]));
  const previousElbAccountKeys = Array.from(new Set([...previousNlbAccountKeys, ...previousAlbAccountKeys]));

  if (additionalAccountKeys.length === 0 && previousElbAccountKeys.length === 0) {
    return;
  }

  // Storing new resource index and updating DDB in this variable
  const newRemoteElbOutputs: OutputUtilElb = {};
  newRemoteElbOutputs.albs = [];
  newRemoteElbOutputs.nlbs = [];

  const nlbIndices = remoteElbOutputUtils.nlbs.flatMap(lb => lb.index) || [];
  let maxNlbIndex = nlbIndices.length === 0 ? 0 : Math.max(...nlbIndices);

  const albIndices = remoteElbOutputUtils.albs.flatMap(lb => lb.index) || [];
  let maxAlbIndex = albIndices.length === 0 ? 0 : Math.max(...albIndices);

  for (const accountKey of additionalAccountKeys) {
    const remoteOutputs: StackOutput[] = await getOutput(outputsTableName, `${accountKey}-${region}-3`, dynamodb);
    const remoteElbOutputs = LoadBalancerOutputFinder.findAll({
      outputs: remoteOutputs,
      accountKey,
      region,
    });

    const remoteNlbOutputs = remoteElbOutputs.filter(elb => elb.type === 'NETWORK');
    const remoteAlbOutputs = remoteElbOutputs.filter(elb => elb.type === 'APPLICATION');

    if (remoteElbOutputs.length === 0 && remoteNlbOutputs.length === 0 && remoteAlbOutputs.length === 0) {
      continue;
    }
    const saveNlbOp = await saveElbOutputsImpl({
      acceleratorPrefix,
      lbOutputs: remoteNlbOutputs,
      lbUtil: remoteElbOutputUtils.nlbs?.filter(lb => lb.account === accountKey) || [],
      ssm,
      type: 'nlb',
      accountKey,
      source: 'remote',
      maxIndex: maxNlbIndex,
      accounts: accounts!,
    });
    newRemoteElbOutputs.nlbs.push(...saveNlbOp.lbs);
    maxNlbIndex = saveNlbOp.currentMaxIndex!;

    const saveAlbOp = await saveElbOutputsImpl({
      acceleratorPrefix,
      lbOutputs: remoteAlbOutputs,
      lbUtil: remoteElbOutputUtils.albs?.filter(lb => lb.account === accountKey) || [],
      ssm,
      type: 'alb',
      accountKey,
      source: 'remote',
      maxIndex: maxAlbIndex,
      accounts: accounts!,
    });
    newRemoteElbOutputs.albs.push(...saveAlbOp.lbs);
    maxAlbIndex = saveAlbOp.currentMaxIndex!;
  }

  await saveIndexOutput(
    outputUtilsTableName,
    `${account.key}-${region}-elb`,
    JSON.stringify(newRemoteElbOutputs),
    dynamodb,
  );

  const removeNlbAccounts = previousNlbAccountKeys.filter(lb => !additionalNlbAccountKeys.includes(lb));
  const removeAlbAccounts = previousAlbAccountKeys.filter(lb => !additionalAlbAccountKeys.includes(lb));
  const removalNlbs = removeNlbAccounts
    .map(lb =>
      (remoteElbOutputUtils.nlbs || [])
        .filter(l => l.account === lb)
        .map(nlb => [
          `/${acceleratorPrefix}/elb/nlb/${nlb.index}/name`,
          `/${acceleratorPrefix}/elb/nlb/${nlb.index}/dns`,
          `/${acceleratorPrefix}/elb/nlb/${nlb.index}/account`,
          `/${acceleratorPrefix}/elb/nlb/${nlb.index}/arn`,
        ]),
    )
    .flatMap(s => s)
    .flatMap(r => r);
  const removalAlbs = removeAlbAccounts
    .map(lb =>
      (remoteElbOutputUtils.albs || [])
        .filter(l => l.account === lb)
        .map(alb => [
          `/${acceleratorPrefix}/elb/alb/${alb.index}/name`,
          `/${acceleratorPrefix}/elb/alb/${alb.index}/dns`,
          `/${acceleratorPrefix}/elb/alb/${alb.index}/account`,
          `/${acceleratorPrefix}/elb/alb/${alb.index}/arn`,
        ]),
    )
    .flatMap(s => s)
    .flatMap(r => r);
  const removeNames: string[] = [...removalNlbs, ...removalAlbs];
  while (removeNames.length > 0) {
    await ssm.deleteParameters(removeNames.splice(0, 10));
  }
}

async function saveElbOutputsImpl(props: {
  lbOutputs: LoadBalancerOutput[];
  ssm: SSM;
  acceleratorPrefix: string;
  lbUtil: OutputUtilLbType[];
  type: 'alb' | 'nlb';
  accountKey: string;
  source: 'local' | 'remote';
  maxIndex?: number;
  accounts: Account[];
}): Promise<{
  lbs: OutputUtilLbType[];
  currentMaxIndex?: number;
}> {
  const { acceleratorPrefix, lbOutputs, lbUtil, ssm, type, accountKey, source, accounts } = props;
  const lbPrefix = source === 'local' ? 'lelb' : 'elb';
  if (lbUtil.length === 0 && lbOutputs.length === 0) {
    return {
      lbs: [],
    };
  }
  const newLbUtils: OutputUtilLbType[] = [];
  let maxIndex: number;
  if (props.maxIndex) {
    maxIndex = props.maxIndex;
  } else {
    const indices = lbUtil.flatMap(lb => lb.index) || [];
    maxIndex = indices.length === 0 ? 0 : Math.max(...indices);
  }
  for (const nlbOutput of lbOutputs) {
    let currentIndex: number;
    const previousIndex = lbUtil.findIndex(lb => lb.name === nlbOutput.name && lb.account === accountKey);
    if (previousIndex >= 0) {
      currentIndex = lbUtil[previousIndex].index;
    } else {
      currentIndex = ++maxIndex;
    }

    const lbOutput: OutputUtilLbType = {
      name: nlbOutput.name,
      index: currentIndex,
      account: accountKey,
      parameters: ['name', 'dns', 'arn', 'account'],
    };
    if (previousIndex < 0) {
      await ssm.putParameter(`/${acceleratorPrefix}/${lbPrefix}/${type}/${currentIndex}/name`, nlbOutput.displayName);
      await ssm.putParameter(`/${acceleratorPrefix}/${lbPrefix}/${type}/${currentIndex}/dns`, nlbOutput.dnsName);
      await ssm.putParameter(`/${acceleratorPrefix}/${lbPrefix}/${type}/${currentIndex}/arn`, nlbOutput.arn);
      if (source === 'remote') {
        await ssm.putParameter(
          `/${acceleratorPrefix}/${lbPrefix}/${type}/${currentIndex}/account`,
          getAccountId(accounts, accountKey)!,
        );
      }
    } else {
      const previousParams = lbUtil[previousIndex].parameters || [];
      if (!previousParams.includes('name')) {
        await ssm.putParameter(`/${acceleratorPrefix}/${lbPrefix}/${type}/${currentIndex}/name`, nlbOutput.displayName);
      }
      if (!previousParams.includes('dns')) {
        await ssm.putParameter(`/${acceleratorPrefix}/${lbPrefix}/${type}/${currentIndex}/dns`, nlbOutput.dnsName);
      }
      if (!previousParams.includes('arn')) {
        await ssm.putParameter(`/${acceleratorPrefix}/${lbPrefix}/${type}/${currentIndex}/arn`, nlbOutput.arn);
      }
      if (!previousParams.includes('account') && source === 'remote') {
        await ssm.putParameter(
          `/${acceleratorPrefix}/${lbPrefix}/${type}/${currentIndex}/account`,
          getAccountId(accounts, accountKey)!,
        );
      }
      lbUtil.splice(previousIndex, 1);
    }
    newLbUtils.push(lbOutput);
  }

  const removeNames = lbUtil
    .map(lb => [
      `/${acceleratorPrefix}/${lbPrefix}/${type}/${lb.index}/name`,
      `/${acceleratorPrefix}/${lbPrefix}/${type}/${lb.index}/dns`,
      `/${acceleratorPrefix}/${lbPrefix}/${type}/${lb.index}/account`,
      `/${acceleratorPrefix}/${lbPrefix}/${type}/${lb.index}/arn`,
    ])
    .flatMap(s => s);
  while (removeNames.length > 0) {
    await ssm.deleteParameters(removeNames.splice(0, 10));
  }
  return {
    lbs: newLbUtils,
    currentMaxIndex: maxIndex,
  };
}
