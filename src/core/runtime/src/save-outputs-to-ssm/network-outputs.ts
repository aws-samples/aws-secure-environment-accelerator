import { getStackJsonOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getOutput, OutputUtilGenericType, SaveOutputsInput } from './utils';
import {
  SecurityGroupsOutput,
  VpcOutputFinder,
  VpcSecurityGroupOutput,
  VpcSubnetOutput,
} from '@aws-accelerator/common-outputs/src/vpc';
import {
  ResolvedVpcConfig,
  SecurityGroupConfig,
  RouteTableConfig,
  SubnetConfig,
} from '@aws-accelerator/common-config/';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { getUpdateValueInput } from '../utils/dynamodb-requests';

interface OutputUtilVpc {
  name: string;
  subnets: OutputUtilGenericType[];
  securityGroups: OutputUtilGenericType[];
  routeTables: OutputUtilGenericType[];
  index: number;
  type: 'vpc' | 'lvpc';
}

interface OutputUtilNetwork {
  vpcs?: OutputUtilVpc[];
}

function getIndex<T>(input: T[], searchName: string) {
  console.log(typeof input);
}
/**
 * Outputs for network related deployments will be found in following phases
 *
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
  const { acceleratorPrefix, account, config, dynamodb, outputsTableName, ssm, region } = props;
  const networkOutputUtils: OutputUtilNetwork = {
    vpcs: [],
  };
  const removalNetworkOutputUtils: OutputUtilNetwork = {
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
  for (const resolvedVpcConfig of localVpcConfigs) {
    let currentIndex: number;
    const previousVpcDetailsIndex = networkOutputUtils.vpcs.findIndex(
      vpc => vpc.type === 'lvpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
    );

    if (previousVpcDetailsIndex && previousVpcDetailsIndex >= 0) {
      currentIndex = networkOutputUtils.vpcs[previousVpcDetailsIndex].index;
    } else {
      currentIndex = ++lvpcMaxIndex;
    }
    // getIndex(networkOutputUtils.lvpcs!, '')
    const vpcResult = await saveVpcOutputs({
      index: currentIndex,
      resolvedVpcConfig,
      outputs: localOutputs,
      ssm,
      acceleratorPrefix,
      vpcPrefix: 'lvpc',
      account,
      vpcUtil: previousVpcDetailsIndex ? networkOutputUtils.vpcs[previousVpcDetailsIndex] : undefined,
    });
    if (vpcResult) {
      if (previousVpcDetailsIndex >= 0) {
        networkOutputUtils.vpcs[previousVpcDetailsIndex] = vpcResult;
      } else {
        networkOutputUtils.vpcs.push(vpcResult);
      }
    }

    const removalVpcDetailsIndex = removalNetworkOutputUtils.vpcs?.findIndex(
      vpc => vpc.type === 'lvpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
    );
    if (removalVpcDetailsIndex && removalVpcDetailsIndex >= 0) {
      removalNetworkOutputUtils.vpcs?.splice(removalVpcDetailsIndex);
    }
  }

  const vpcIndices = networkOutputUtils.vpcs.filter(vpc => vpc.type === 'vpc').flatMap(v => v.index) || [];
  let vpcMaxIndex = vpcIndices.length === 0 ? 0 : Math.max(...vpcIndices);
  for (const resolvedVpcConfig of localOuVpcConfigs) {
    let currentIndex: number;
    const previousVpcDetailsIndex = networkOutputUtils.vpcs.findIndex(
      vpc => vpc.type === 'vpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
    );
    if (previousVpcDetailsIndex && previousVpcDetailsIndex >= 0) {
      currentIndex = networkOutputUtils.vpcs[previousVpcDetailsIndex].index;
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
      vpcUtil: previousVpcDetailsIndex ? networkOutputUtils.vpcs[previousVpcDetailsIndex] : undefined,
    });

    if (vpcResult) {
      if (previousVpcDetailsIndex >= 0) {
        networkOutputUtils.vpcs[previousVpcDetailsIndex] = vpcResult;
      } else {
        networkOutputUtils.vpcs.push(vpcResult);
      }
    }

    const removalVpcDetailsIndex = removalNetworkOutputUtils.vpcs?.findIndex(
      vpc => vpc.type === 'vpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
    );
    if (removalVpcDetailsIndex && removalVpcDetailsIndex >= 0) {
      removalNetworkOutputUtils.vpcs?.splice(removalVpcDetailsIndex);
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
      const previousVpcDetailsIndex = networkOutputUtils.vpcs.findIndex(
        vpc => vpc.type === 'vpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
      );
      if (previousVpcDetailsIndex && previousVpcDetailsIndex >= 0) {
        currentIndex = networkOutputUtils.vpcs[previousVpcDetailsIndex].index;
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
        vpcUtil: previousVpcDetailsIndex ? networkOutputUtils.vpcs[previousVpcDetailsIndex] : undefined,
      });

      if (vpcResult) {
        if (previousVpcDetailsIndex >= 0) {
          networkOutputUtils.vpcs[previousVpcDetailsIndex] = vpcResult;
        } else {
          networkOutputUtils.vpcs.push(vpcResult);
        }
      }

      const removalVpcDetailsIndex = removalNetworkOutputUtils.vpcs?.findIndex(
        vpc => vpc.type === 'vpc' && vpc.name === resolvedVpcConfig.vpcConfig.name,
      );
      if (removalVpcDetailsIndex && removalVpcDetailsIndex >= 0) {
        removalNetworkOutputUtils.vpcs?.splice(removalVpcDetailsIndex);
      }
    }
  }
  console.log(JSON.stringify(networkOutputUtils, null, 2));

  const updateExpression = getUpdateValueInput([
    {
      key: 'v',
      name: 'outputValue',
      type: 'S',
      value: JSON.stringify(networkOutputUtils),
    },
  ]);
  await dynamodb.updateItem({
    TableName: `PBMMAccel-OutputUtils`,
    Key: {
      id: { S: `${account.key}-${region}-network` },
    },
    ...updateExpression,
  });
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
      routeTables: [],
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
  //   await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/name`, `${vpcOutput.vpcName}_vpc`);
  //   await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/id`, vpcOutput.vpcId);
  //   await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/cidr`, vpcOutput.cidrBlock);
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

  if (vpcConfig['route-tables'] && vpcOutput.routeTables) {
    vpcUtil.routeTables = await saveRouteTables({
      routeTablesConfig: vpcConfig['route-tables'],
      routeTablesOutputs: vpcOutput.routeTables,
      ssm,
      vpcIndex: index,
      acceleratorPrefix,
      vpcPrefix,
      routeTablesUtil: vpcUtil.routeTables,
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
  const removalSgUtils = [...securityGroupsUtil];
  const updatedObjects: OutputUtilGenericType[] = [];
  for (const sgConfig of securityGroupsConfig) {
    let currentIndex: number;
    const previousSgDetailsIndex = securityGroupsUtil.findIndex(sg => sg.name === sgConfig.name);
    if (previousSgDetailsIndex && previousSgDetailsIndex >= 0) {
      currentIndex = securityGroupsUtil[previousSgDetailsIndex].index;
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
    // await ssm.putParameter(
    //   `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/sg/${sgIndex + 1}/name`,
    //   `${sgConfig.name}_sg`,
    // );
    // await ssm.putParameter(
    //   `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/sg/${sgIndex + 1}/id`,
    //   sgOutput.securityGroupId,
    // );
    const removalSgDetailsIndex = removalSgUtils?.findIndex(r => r.name === sgConfig.name);
    if (removalSgDetailsIndex && removalSgDetailsIndex >= 0) {
      removalSgUtils?.splice(removalSgDetailsIndex);
    }
  }
  return updatedObjects;
}

export async function saveRouteTables(props: {
  routeTablesConfig: RouteTableConfig[];
  routeTablesOutputs: { [name: string]: string };
  ssm: SSM;
  vpcIndex: number;
  acceleratorPrefix: string;
  vpcPrefix: string;
  routeTablesUtil: OutputUtilGenericType[];
}): Promise<OutputUtilGenericType[]> {
  const { acceleratorPrefix, routeTablesConfig, routeTablesOutputs, routeTablesUtil, ssm, vpcIndex, vpcPrefix } = props;
  const routeTableIndices = routeTablesUtil.flatMap(r => r.index) || [];
  let rtMaxIndex = routeTableIndices.length === 0 ? 0 : Math.max(...routeTableIndices);
  const removalObjects = [...routeTablesUtil];
  const updatedObjects: OutputUtilGenericType[] = [];
  for (const routeTableConfig of routeTablesConfig) {
    let currentIndex: number;
    const previousRtDetailsIndex = routeTablesUtil.findIndex(r => r.name === routeTableConfig.name);
    if (previousRtDetailsIndex && previousRtDetailsIndex >= 0) {
      currentIndex = routeTablesUtil[previousRtDetailsIndex].index;
    } else {
      currentIndex = ++rtMaxIndex;
    }
    updatedObjects.push({
      index: currentIndex,
      name: routeTableConfig.name,
    });
    // await ssm.putParameter(
    //   `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/rt/${rtIndex + 1}/name`,
    //   `${routeTableConfig.name}_rt`,
    // );
    // await ssm.putParameter(
    //   `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/rt/${rtIndex + 1}/id`,
    //   routeTablesOutputs[routeTableConfig.name],
    // );
    const removalRtDetailsIndex = removalObjects?.findIndex(r => r.name === routeTableConfig.name);
    if (removalRtDetailsIndex && removalRtDetailsIndex >= 0) {
      removalObjects?.splice(removalRtDetailsIndex);
    }
  }

  for (const removeObject of removalObjects) {
    // TODO: Remove from SSM
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
  subnetsUtil: OutputUtilGenericType[];
}): Promise<OutputUtilGenericType[]> {
  const { acceleratorPrefix, ssm, subnetOutputs, subnetsConfig, vpcIndex, vpcName, vpcPrefix, subnetsUtil } = props;
  const subnetIndices = subnetsUtil.flatMap(s => s.index) || [];
  let subnetMaxIndex = subnetIndices.length === 0 ? 0 : Math.max(...subnetIndices);
  const removalSubnetUtils = [...subnetsUtil];
  const updatedObjects: OutputUtilGenericType[] = [];
  for (const subnetConfig of subnetsConfig || []) {
    let currentIndex: number;
    const previousSubnetDetailsIndex = subnetsUtil.findIndex(s => s.name === subnetConfig.name);
    if (previousSubnetDetailsIndex && previousSubnetDetailsIndex >= 0) {
      currentIndex = subnetsUtil[previousSubnetDetailsIndex].index;
    } else {
      currentIndex = ++subnetMaxIndex;
    }
    updatedObjects.push({
      index: currentIndex,
      name: subnetConfig.name,
    });
    for (const subnetDef of subnetConfig.definitions.filter(sn => !sn.disabled)) {
      const subnetOutput = subnetOutputs.find(vs => vs.subnetName === subnetConfig.name && vs.az === subnetDef.az);
      if (!subnetOutput) {
        console.warn(`Didn't find subnet "${subnetConfig.name}" in output`);
        continue;
      }
      //   await ssm.putParameter(
      //     `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${currentIndex}/az${subnetDef.az}/name`,
      //     `${subnetOutput.subnetName}_${vpcName}_az${subnetOutput.az}_net`,
      //   );
      //   await ssm.putParameter(
      //     `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${currentIndex}/az${subnetOutput.az}/id`,
      //     subnetOutput.subnetId,
      //   );
      //   await ssm.putParameter(
      //     `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${currentIndex}/az${subnetOutput.az}/cidr`,
      //     subnetOutput.cidrBlock,
      //   );
    }
    const removalSubnetDetailsIndex = subnetsUtil?.findIndex(s => s.name === subnetConfig.name);
    if (removalSubnetDetailsIndex && removalSubnetDetailsIndex >= 0) {
      removalSubnetUtils?.splice(removalSubnetDetailsIndex);
    }
  }
  return updatedObjects;
}
