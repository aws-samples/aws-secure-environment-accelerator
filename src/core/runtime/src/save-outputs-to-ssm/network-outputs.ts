import { getStackJsonOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getOutput, SaveOutputsInput } from './utils';
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
  const vpcConfigs = config.getVpcConfigs();
  const localVpcConfigs = vpcConfigs.filter(vc => vc.accountKey === account.key && vc.vpcConfig.region === region);
  const sharedVpcConfigs = vpcConfigs.filter(
    vc =>
      vc.accountKey != account.key &&
      vc.vpcConfig.region === region &&
      vc.ouKey === account.ou &&
      (vc.vpcConfig.subnets?.find(sc => sc['share-to-ou-accounts']) ||
        vc.vpcConfig.subnets?.find(sc => sc['share-to-specific-accounts']?.includes(account.key))),
  );
  const localOutputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${region}-1`, dynamodb);
  let index = 0;
  for (const resolvedVpcConfig of localVpcConfigs) {
    if (resolvedVpcConfig.ouKey) {
      await saveVpcOutputs(++index, resolvedVpcConfig, localOutputs, ssm, acceleratorPrefix, 'vpc', account);
    } else {
      await saveVpcOutputs(++index, resolvedVpcConfig, localOutputs, ssm, acceleratorPrefix, 'lvpc', account);
    }
  }

  index = 0;
  if (sharedVpcConfigs.length === 0) {
    return;
  }
  const sharedSgOutputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${region}-2`, dynamodb);
  const sgOutputs: SecurityGroupsOutput[] = getStackJsonOutput(sharedSgOutputs, {
    accountKey: account.key,
    outputType: 'SecurityGroupsOutput',
  });
  for (const resolvedVpcConfig of sharedVpcConfigs) {
    const rootOutputs: StackOutput[] = await getOutput(
      outputsTableName,
      `${resolvedVpcConfig.accountKey}-${region}-1`,
      dynamodb,
    );
    const vpcSgOutputs = sgOutputs.find(sg => sg.vpcName);
    await saveVpcOutputs(
      ++index,
      resolvedVpcConfig,
      rootOutputs,
      ssm,
      acceleratorPrefix,
      'vpc',
      account,
      vpcSgOutputs?.securityGroupIds,
      true,
    );
  }
}

async function saveVpcOutputs(
  index: number,
  resolvedVpcConfig: ResolvedVpcConfig,
  outputs: StackOutput[],
  ssm: SSM,
  acceleratorPrefix: string,
  vpcPrefix: string,
  account: Account,
  sgOutputs?: VpcSecurityGroupOutput[],
  sharedVpc?: boolean,
) {
  const { accountKey, vpcConfig } = resolvedVpcConfig;
  const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
    outputs,
    accountKey,
    vpcName: vpcConfig.name,
  });
  if (!vpcOutput) {
    console.warn(`VPC "${vpcConfig.name}" in account "${accountKey}" is not created`);
    return;
  }
  await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/name`, `${vpcOutput.vpcName}_vpc`);
  await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/id`, vpcOutput.vpcId);
  await ssm.putParameter(`/${acceleratorPrefix}/network/${vpcPrefix}/${index}/cidr`, vpcOutput.cidrBlock);
  let subnetsConfig = vpcConfig.subnets;
  if (sharedVpc) {
    subnetsConfig = vpcConfig.subnets?.filter(
      vs => vs['share-to-ou-accounts'] || vs['share-to-specific-accounts']?.includes(account.key),
    );
  }
  if (subnetsConfig) {
    await saveSubnets(subnetsConfig, vpcOutput.subnets, ssm, index, acceleratorPrefix, vpcPrefix, vpcConfig.name);
  }

  if (vpcConfig['route-tables'] && vpcOutput.routeTables) {
    await saveRouteTables(vpcConfig['route-tables'], vpcOutput.routeTables, ssm, index, acceleratorPrefix, vpcPrefix);
  }

  let vpcSgOutputs: VpcSecurityGroupOutput[] = vpcOutput.securityGroups;
  if (sharedVpc) {
    vpcSgOutputs = sgOutputs!;
  }
  if (vpcConfig['security-groups'] && vpcSgOutputs) {
    await saveSecurityGroups(vpcConfig['security-groups'], vpcSgOutputs, ssm, index, acceleratorPrefix, vpcPrefix);
  }
}

export async function saveSecurityGroups(
  securityGroupsConfig: SecurityGroupConfig[],
  securityGroupsOutputs: VpcSecurityGroupOutput[],
  ssm: SSM,
  vpcIndex: number,
  acceleratorPrefix: string,
  vpcPrefix: string,
) {
  let sgIndex = 0;
  for (const sgConfig of securityGroupsConfig) {
    const sgOutput = securityGroupsOutputs.find(sg => sg.securityGroupName === sgConfig.name);
    if (!sgOutput) {
      console.warn(`Didn't find SecurityGroup "${sgConfig.name}" in output`);
      continue;
    }
    await ssm.putParameter(
      `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/sg/${sgIndex + 1}/name`,
      `${sgConfig.name}_sg`,
    );
    await ssm.putParameter(
      `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/sg/${sgIndex + 1}/id`,
      sgOutput.securityGroupId,
    );
    sgIndex++;
  }
}

export async function saveRouteTables(
  routeTablesConfig: RouteTableConfig[],
  routeTablesOutputs: { [name: string]: string },
  ssm: SSM,
  vpcIndex: number,
  acceleratorPrefix: string,
  vpcPrefix: string,
) {
  let rtIndex = 0;
  for (const routeTableConfig of routeTablesConfig) {
    await ssm.putParameter(
      `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/rt/${rtIndex + 1}/name`,
      `${routeTableConfig.name}_rt`,
    );
    await ssm.putParameter(
      `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/rt/${rtIndex + 1}/id`,
      routeTablesOutputs[routeTableConfig.name],
    );
    rtIndex++;
  }
}

export async function saveSubnets(
  subnetsConfig: SubnetConfig[],
  subnetOutputs: VpcSubnetOutput[],
  ssm: SSM,
  vpcIndex: number,
  acceleratorPrefix: string,
  vpcPrefix: string,
  vpcName: string,
) {
  let netIndex = 0;
  for (const subnetConfig of subnetsConfig || []) {
    for (const subnetDef of subnetConfig.definitions.filter(sn => !sn.disabled)) {
      const subnetOutput = subnetOutputs.find(vs => vs.subnetName === subnetConfig.name && vs.az === subnetDef.az);
      if (!subnetOutput) {
        console.warn(`Didn't find subnet "${subnetConfig.name}" in output`);
        continue;
      }
      await ssm.putParameter(
        `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${netIndex + 1}/az${subnetDef.az}/name`,
        `${subnetOutput.subnetName}_${vpcName}_az${subnetOutput.az}_net`,
      );
      await ssm.putParameter(
        `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${netIndex + 1}/az${subnetOutput.az}/id`,
        subnetOutput.subnetId,
      );
      await ssm.putParameter(
        `/${acceleratorPrefix}/network/${vpcPrefix}/${vpcIndex}/net/${netIndex + 1}/az${subnetOutput.az}/cidr`,
        subnetOutput.cidrBlock,
      );
    }
    netIndex++;
  }
}
