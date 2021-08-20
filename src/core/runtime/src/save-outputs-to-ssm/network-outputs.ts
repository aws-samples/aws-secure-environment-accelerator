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

import { getStackJsonOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getOutput, OutputUtilGenericType, SaveOutputsInput, getIndexOutput, saveIndexOutput } from './utils';
import {
  SecurityGroupsOutput,
  VpcOutputFinder,
  VpcSecurityGroupOutput,
  VpcSubnetOutput,
} from '@aws-accelerator/common-outputs/src/vpc';
import { ResolvedVpcConfig, SecurityGroupConfig, SubnetConfig } from '@aws-accelerator/common-config';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { STS } from '@aws-accelerator/common/src/aws/sts';

interface OutputUtilSubnet extends OutputUtilGenericType {
  azs: string[];
}
interface OutputUtilVpc extends OutputUtilGenericType {
  subnets: OutputUtilSubnet[];
  securityGroups: OutputUtilGenericType[];
  type: 'vpc' | 'lvpc';
}

interface OutputUtilNetwork {
  vpcs?: OutputUtilVpc[];
}

/**
 * Outputs for network related deployments will be found in following phases
 * - Phase-1
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
export async function saveNetworkOutputs(props: SaveOutputsInput) {
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
  const oldNetworkOutputUtils = await getIndexOutput(
    outputUtilsTableName,
    `${account.key}-${region}-network`,
    dynamodb,
  );
  // Existing index check happens on this variable
  let networkOutputUtils: OutputUtilNetwork;
  if (oldNetworkOutputUtils) {
    networkOutputUtils = oldNetworkOutputUtils;
  } else {
    networkOutputUtils = {
      vpcs: [],
    };
  }

  // Storing new resource index and updating DDB in this variable
  const newNetworkOutputs: OutputUtilNetwork = {
    vpcs: [],
  };
  if (!newNetworkOutputs.vpcs) {
    newNetworkOutputs.vpcs = [];
  }

  // Removal from SSM Parameter store happens on left over in this variable
  const removalObjects: OutputUtilNetwork = {
    vpcs: [...(networkOutputUtils.vpcs || [])],
  };

  const vpcConfigs = config.getVpcConfigs();
  const localVpcConfigs = vpcConfigs.filter(
    vc => vc.accountKey === account.key && vc.vpcConfig.region === region && !vc.ouKey,
  );
  const localOuVpcConfigs = vpcConfigs.filter(
    vc => vc.accountKey === account.key && vc.vpcConfig.region === region && vc.ouKey,
  );
  const sharedVpcConfigs = vpcConfigs.filter(
    vc =>
      vc.accountKey !== account.key &&
      vc.vpcConfig.region === region &&
      vc.ouKey === account.ou &&
      (vc.vpcConfig.subnets?.find(sc => sc['share-to-ou-accounts']) ||
        vc.vpcConfig.subnets?.find(sc => sc['share-to-specific-accounts']?.includes(account.key))),
  );

  let localOutputs: StackOutput[] = [];
  if (localVpcConfigs.length > 0 || localOuVpcConfigs.length > 0) {
    localOutputs = await getOutput(outputsTableName, `${account.key}-${region}-1`, dynamodb);
  }
  if (!networkOutputUtils.vpcs) {
    networkOutputUtils.vpcs = [];
  }
  const lvpcIndices = networkOutputUtils.vpcs.filter(lv => lv.type === 'lvpc').flatMap(v => v.index) || [];
  let lvpcMaxIndex = lvpcIndices.length === 0 ? 0 : Math.max(...lvpcIndices);

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const ssm = new SSM(credentials, region);

  for (const resolvedVpcConfig of localVpcConfigs) {
    let currentIndex: number;
    const previousIndex = networkOutputUtils.vpcs.findIndex(
      vpc => vpc.type === 'lvpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
    );
    if (previousIndex >= 0) {
      currentIndex = networkOutputUtils.vpcs[previousIndex].index;
    } else {
      currentIndex = ++lvpcMaxIndex;
    }

    const vpcResult = await saveVpcOutputs({
      index: currentIndex,
      resolvedVpcConfig,
      outputs: localOutputs,
      ssm,
      acceleratorPrefix,
      vpcPrefix: 'lvpc',
      account,
      vpcUtil: previousIndex >= 0 ? networkOutputUtils.vpcs[previousIndex] : undefined,
    });
    if (vpcResult) {
      newNetworkOutputs.vpcs.push(vpcResult);
    }

    const removalIndex = removalObjects.vpcs?.findIndex(
      vpc => vpc.type === 'lvpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
    );

    if (removalIndex! >= 0) {
      removalObjects.vpcs?.splice(removalIndex!, 1);
    }
  }

  const vpcIndices = networkOutputUtils.vpcs.filter(vpc => vpc.type === 'vpc').flatMap(v => v.index) || [];
  let vpcMaxIndex = vpcIndices.length === 0 ? 0 : Math.max(...vpcIndices);
  for (const resolvedVpcConfig of localOuVpcConfigs) {
    let currentIndex: number;
    const previousIndex = networkOutputUtils.vpcs.findIndex(
      vpc => vpc.type === 'vpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
    );
    if (previousIndex >= 0) {
      currentIndex = networkOutputUtils.vpcs[previousIndex].index;
    } else {
      currentIndex = ++vpcMaxIndex;
    }
    const vpcResult = await saveVpcOutputs({
      index: currentIndex,
      resolvedVpcConfig,
      outputs: localOutputs,
      ssm,
      acceleratorPrefix,
      vpcPrefix: 'vpc',
      account,
      vpcUtil: previousIndex >= 0 ? networkOutputUtils.vpcs[previousIndex] : undefined,
    });

    if (vpcResult) {
      newNetworkOutputs.vpcs.push(vpcResult);
    }

    const removalIndex = removalObjects.vpcs?.findIndex(
      vpc => vpc.type === 'vpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
    );
    if (removalIndex! >= 0) {
      removalObjects.vpcs?.splice(removalIndex!, 1);
    }
  }
  if (sharedVpcConfigs.length > 0) {
    const sharedSgOutputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${region}-2`, dynamodb);
    const sgOutputs: SecurityGroupsOutput[] = getStackJsonOutput(sharedSgOutputs, {
      accountKey: account.key,
      outputType: 'SecurityGroupsOutput',
    });

    for (const resolvedVpcConfig of sharedVpcConfigs) {
      let currentIndex: number;
      const previousIndex = networkOutputUtils.vpcs.findIndex(
        vpc => vpc.type === 'vpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
      );
      if (previousIndex >= 0) {
        currentIndex = networkOutputUtils.vpcs[previousIndex].index;
      } else {
        currentIndex = ++vpcMaxIndex;
      }
      const rootOutputs: StackOutput[] = await getOutput(
        outputsTableName,
        `${resolvedVpcConfig.accountKey}-${region}-1`,
        dynamodb,
      );
      const vpcSgOutputs = sgOutputs.find(sg => sg.vpcName);
      const vpcResult = await saveVpcOutputs({
        index: currentIndex,
        resolvedVpcConfig,
        outputs: rootOutputs,
        ssm,
        acceleratorPrefix,
        vpcPrefix: 'vpc',
        account,
        sgOutputs: vpcSgOutputs?.securityGroupIds,
        sharedVpc: true,
        vpcUtil: previousIndex >= 0 ? networkOutputUtils.vpcs[previousIndex] : undefined,
      });

      if (vpcResult) {
        newNetworkOutputs.vpcs.push(vpcResult);
      }

      const removalIndex = removalObjects.vpcs?.findIndex(
        vpc => vpc.type === 'vpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
      );
      if (removalIndex! >= 0) {
        removalObjects.vpcs?.splice(removalIndex!, 1);
      }
    }
  }

  await saveIndexOutput(
    outputUtilsTableName,
    `${account.key}-${region}-network`,
    JSON.stringify(newNetworkOutputs),
    dynamodb,
  );
  for (const removeObject of removalObjects.vpcs || []) {
    const removalSgs = removeObject.securityGroups
      .map(sg => [
        `/${acceleratorPrefix}/network/${removeObject.type}/${removeObject.index}/sg/${sg.index}/name`,
        `/${acceleratorPrefix}/network/${removeObject.type}/${removeObject.index}/sg/${sg.index}/id`,
      ])
      .flatMap(s => s);
    const removalSns = removeObject.subnets
      .map(sn =>
        sn.azs.map(snz => [
          `/${acceleratorPrefix}/network/${removeObject.type}/${removeObject.index}/net/${sn.index}/az${snz}/name`,
          `/${acceleratorPrefix}/network/${removeObject.type}/${removeObject.index}/net/${sn.index}/az${snz}/id`,
          `/${acceleratorPrefix}/network/${removeObject.type}/${removeObject.index}/net/${sn.index}/az${snz}/cidr`,
        ]),
      )
      .flatMap(azSn => azSn)
      .flatMap(sn => sn);
    const removalVpc = [
      `/${acceleratorPrefix}/network/${removeObject.type}/${removeObject.index}/name`,
      `/${acceleratorPrefix}/network/${removeObject.type}/${removeObject.index}/id`,
      `/${acceleratorPrefix}/network/${removeObject.type}/${removeObject.index}/cidr`,
      `/${acceleratorPrefix}/network/${removeObject.type}/${removeObject.index}/cidr2`,
    ];
    const removeNames = [...removalSgs, ...removalSns, ...removalVpc];
    while (removeNames.length > 0) {
      await ssm.deleteParameters(removeNames.splice(0, 10));
    }
  }
}

async function saveVpcOutputs(props: {
  index: number;
  resolvedVpcConfig: ResolvedVpcConfig;
  outputs: StackOutput[];
  ssm: SSM;
  acceleratorPrefix: string;
  vpcPrefix: 'vpc' | 'lvpc';
  account: Account;
  vpcUtil?: OutputUtilVpc;
  sgOutputs?: VpcSecurityGroupOutput[];
  sharedVpc?: boolean;
}): Promise<OutputUtilVpc | undefined> {
  const { acceleratorPrefix, account, index, outputs, resolvedVpcConfig, ssm, vpcPrefix, sgOutputs, sharedVpc } = props;
  const { accountKey, vpcConfig } = resolvedVpcConfig;
  let vpcUtil: OutputUtilVpc;
  if (props.vpcUtil) {
    vpcUtil = props.vpcUtil;
  } else {
    vpcUtil = {
      index,
      name: vpcConfig.name,
      securityGroups: [],
      subnets: [],
      type: vpcPrefix,
    };
  }
  const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
    outputs,
    accountKey,
    vpcName: vpcConfig.name,
  });
  if (!vpcOutput) {
    console.warn(`VPC "${vpcConfig.name}" in account "${accountKey}" is not created`);
    return;
  }
  if (!vpcUtil.parameters) {
    vpcUtil.parameters = [];
  }
  if (!vpcUtil.parameters.includes('name')) {
    await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/name`, `${vpcOutput.vpcName}_vpc`);
    vpcUtil.parameters.push('name');
  }
  if (!vpcUtil.parameters.includes('id')) {
    await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/id`, vpcOutput.vpcId);
    vpcUtil.parameters.push('id');
  }
  if (!vpcUtil.parameters.includes('cidr')) {
    await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/cidr`, vpcOutput.cidrBlock);
    vpcUtil.parameters.push('cidr');
  }

  if (!vpcUtil.parameters.includes('cidr2') && vpcConfig.cidr.length > 1) {
    for (const [cidrIndex, additionalCidr] of vpcOutput.additionalCidrBlocks.entries()) {
      await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/cidr2/${cidrIndex}`, additionalCidr);
    }
    vpcUtil.parameters.push('cidr2');
  }
  let subnetsConfig = vpcConfig.subnets;
  if (sharedVpc) {
    subnetsConfig = vpcConfig.subnets?.filter(
      vs => vs['share-to-ou-accounts'] || vs['share-to-specific-accounts']?.includes(account.key),
    );
  }
  if (subnetsConfig) {
    vpcUtil.subnets = await saveSubnets({
      subnetsConfig,
      subnetOutputs: vpcOutput.subnets,
      ssm,
      vpcIndex: index,
      acceleratorPrefix,
      vpcPrefix,
      vpcName: vpcConfig.name,
      subnetsUtil: vpcUtil.subnets,
    });
  }

  let vpcSgOutputs: VpcSecurityGroupOutput[] = vpcOutput.securityGroups;
  if (sharedVpc) {
    vpcSgOutputs = sgOutputs!;
  }
  if (vpcConfig['security-groups'] && vpcSgOutputs) {
    vpcUtil.securityGroups = await saveSecurityGroups({
      securityGroupsConfig: vpcConfig['security-groups'],
      securityGroupsOutputs: vpcSgOutputs,
      ssm,
      vpcIndex: index,
      acceleratorPrefix,
      vpcPrefix,
      securityGroupsUtil: vpcUtil.securityGroups,
    });
  }
  console.log(vpcUtil);
  return vpcUtil;
}

export async function saveSecurityGroups(props: {
  securityGroupsConfig: SecurityGroupConfig[];
  securityGroupsOutputs: VpcSecurityGroupOutput[];
  ssm: SSM;
  vpcIndex: number;
  acceleratorPrefix: string;
  vpcPrefix: string;
  securityGroupsUtil: OutputUtilGenericType[];
}): Promise<OutputUtilGenericType[]> {
  const {
    acceleratorPrefix,
    securityGroupsConfig,
    securityGroupsOutputs,
    ssm,
    vpcIndex,
    vpcPrefix,
    securityGroupsUtil,
  } = props;
  const sgIndices = securityGroupsUtil.flatMap(r => r.index) || [];
  let sgMaxIndex = sgIndices.length === 0 ? 0 : Math.max(...sgIndices);
  const removalObjects = [...securityGroupsUtil];
  const updatedObjects: OutputUtilGenericType[] = [];
  for (const sgConfig of securityGroupsConfig) {
    let currentIndex: number;
    const previousIndex = securityGroupsUtil.findIndex(sg => sg.name === sgConfig.name);
    if (previousIndex >= 0) {
      currentIndex = securityGroupsUtil[previousIndex].index;
    } else {
      currentIndex = ++sgMaxIndex;
    }
    updatedObjects.push({
      index: currentIndex,
      name: sgConfig.name,
    });
    const sgOutput = securityGroupsOutputs.find(sg => sg.securityGroupName === sgConfig.name);
    if (!sgOutput) {
      console.warn(`Didn't find SecurityGroup "${sgConfig.name}" in output`);
      continue;
    }
    if (previousIndex < 0) {
      await ssm.putParameter(
        `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/sg/${currentIndex}/name`,
        `${sgConfig.name}_sg`,
      );
      await ssm.putParameter(
        `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/sg/${currentIndex}/id`,
        sgOutput.securityGroupId,
      );
    }

    const removalIndex = removalObjects?.findIndex(r => r.name === sgConfig.name);
    if (removalIndex >= 0) {
      removalObjects?.splice(removalIndex, 1);
    }
  }

  const removeNames = removalObjects
    .map(sg => [
      `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/sg/${sg.index}/name`,
      `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/sg/${sg.index}/id`,
    ])
    .flatMap(s => s);
  while (removeNames.length > 0) {
    await ssm.deleteParameters(removeNames.splice(0, 10));
  }
  return updatedObjects;
}

export async function saveSubnets(props: {
  subnetsConfig: SubnetConfig[];
  subnetOutputs: VpcSubnetOutput[];
  ssm: SSM;
  vpcIndex: number;
  acceleratorPrefix: string;
  vpcPrefix: string;
  vpcName: string;
  subnetsUtil: OutputUtilSubnet[];
}): Promise<OutputUtilSubnet[]> {
  const { acceleratorPrefix, ssm, subnetOutputs, subnetsConfig, vpcIndex, vpcName, vpcPrefix, subnetsUtil } = props;
  const subnetIndices = subnetsUtil.flatMap(s => s.index) || [];
  let subnetMaxIndex = subnetIndices.length === 0 ? 0 : Math.max(...subnetIndices);
  const removalObjects = [...subnetsUtil];
  const updatedObjects: OutputUtilSubnet[] = [];
  for (const subnetConfig of subnetsConfig || []) {
    let currentIndex: number;
    const previousIndex = subnetsUtil.findIndex(s => s.name === subnetConfig.name);
    if (previousIndex >= 0) {
      currentIndex = subnetsUtil[previousIndex].index;
    } else {
      currentIndex = ++subnetMaxIndex;
    }
    const newSubnetUtil: OutputUtilSubnet = {
      index: currentIndex,
      name: subnetConfig.name,
      azs: subnetConfig.definitions.filter(sn => !sn.disabled).map(s => s.az),
    };
    for (const subnetDef of subnetConfig.definitions.filter(sn => !sn.disabled)) {
      const subnetOutput = subnetOutputs.find(vs => vs.subnetName === subnetConfig.name && vs.az === subnetDef.az);
      if (!subnetOutput) {
        console.warn(`Didn't find subnet "${subnetConfig.name}" in output`);
        continue;
      }
      if (previousIndex < 0 || (previousIndex >= 0 && !subnetsUtil[previousIndex].azs.includes(subnetDef.az))) {
        await ssm.putParameter(
          `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${currentIndex}/az${subnetDef.az}/name`,
          `${subnetOutput.subnetName}_${vpcName}_az${subnetOutput.az}_net`,
        );
        await ssm.putParameter(
          `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${currentIndex}/az${subnetOutput.az}/id`,
          subnetOutput.subnetId,
        );
        await ssm.putParameter(
          `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${currentIndex}/az${subnetOutput.az}/cidr`,
          subnetOutput.cidrBlock,
        );
      }
    }

    updatedObjects.push(newSubnetUtil);
    const removalIndex = removalObjects?.findIndex(s => s.name === subnetConfig.name);
    if (removalIndex >= 0) {
      removalObjects?.splice(removalIndex, 1);
    }
  }

  const removeNames = removalObjects
    .map(sn =>
      sn.azs.map(snz => [
        `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${sn.index}/az${snz}/name`,
        `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${sn.index}/az${snz}/id`,
        `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${sn.index}/az${snz}/cidr`,
      ]),
    )
    .flatMap(azSn => azSn)
    .flatMap(sn => sn);
  while (removeNames.length > 0) {
    await ssm.deleteParameters(removeNames.splice(0, 10));
  }

  return updatedObjects;
}
