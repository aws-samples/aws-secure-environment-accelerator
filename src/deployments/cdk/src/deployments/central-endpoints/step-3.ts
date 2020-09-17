import { AccountStacks } from '../../common/account-stacks';
import { getStackJsonOutput, ResolversOutput, StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AssociateResolverRules } from '@aws-accelerator/custom-resource-associate-resolver-rules';
import * as c from '@aws-accelerator/common-config';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import {
  StaticResourcesOutput,
  StaticResourcesOutputFinder,
} from '@aws-accelerator/common-outputs/src/static-resource';
import { CfnStaticResourcesOutput } from './outputs';

// Changing these values will lead to redeploying all Phase-4 RuleAssociation stacks
const MAX_RESOURCES_IN_STACK = 190;
const RESOURCE_TYPE = 'ResolverRulesAssociation';
const STACK_COMMON_SUFFIX = 'RulesAsscociation';

export interface CentralEndpointsStep3Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 *  Associate VPC to Hosted Zones and Resoler Rules in central vpc account
 */
export async function step3(props: CentralEndpointsStep3Props) {
  const { accountStacks, config, outputs } = props;
  const allVpcConfigs = config.getVpcConfigs();

  const allStaticResources: StaticResourcesOutput[] = StaticResourcesOutputFinder.findAll({
    outputs,
  }).filter(sr => sr.resourceType === RESOURCE_TYPE);

  // Initiate previous stacks to handle deletion of previously deployed stack if there are no resources
  for (const sr of allStaticResources) {
    accountStacks.tryGetOrCreateAccountStack(sr.accountKey, sr.region, `RulesAssc-${sr.suffix}`);
  }

  const accountStaticResourcesConfig: { [accountKey: string]: StaticResourcesOutput[] } = {};
  const accountRegionExistingResources: {
    [accountKey: string]: {
      [region: string]: string[];
    };
  } = {};
  const accountRegionMaxSuffix: {
    [accountKey: string]: {
      [region: string]: number;
    };
  } = {};

  for (const { accountKey, vpcConfig } of allVpcConfigs) {
    const centralPhzConfig = config['global-options'].zones.find(zc => zc.region === vpcConfig.region);
    if (!vpcConfig['use-central-endpoints']) {
      continue;
    }

    // If Current VPC exists in global-options/zones then no need to share it with any Rules
    if (
      accountKey === centralPhzConfig?.account &&
      vpcConfig.region === centralPhzConfig.region &&
      vpcConfig.name === centralPhzConfig['resolver-vpc']
    ) {
      console.log(
        `Current VPC Config ${accountKey}: ${vpcConfig.region}:${vpcConfig.name} is central VPC for Hosted Zones`,
      );
      continue;
    }

    // Retrieving current VPCId
    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      region: vpcConfig.region,
      vpcName: vpcConfig.name,
    });
    if (!vpcOutput) {
      console.error(`Cannot find resolved VPC with name "${vpcConfig.name}"`);
      continue;
    }

    const zoneConfig = config['global-options'].zones.find(z => z.region === vpcConfig.region);
    if (!zoneConfig) {
      console.error(`No Central VPC is defined in Region :: ${vpcConfig.region}`);
      continue;
    }

    const localCentralVpcConfig = config
      .getVpcConfigs()
      .find(vc => vc.accountKey === zoneConfig.account && vc.vpcConfig.name === zoneConfig['resolver-vpc']);
    if (!localCentralVpcConfig) {
      console.error(
        `Central VPC Config is not found in Configuration under "global-options/zones": "${zoneConfig.account}: ${zoneConfig['resolver-vpc']}"`,
      );
      continue;
    }

    const resolversOutputs: ResolversOutput[] = getStackJsonOutput(outputs, {
      accountKey: zoneConfig.account,
      outputType: 'GlobalOptionsOutput',
    });
    const resolverRegionoutputs = resolversOutputs.find(
      resOut => resOut.region === vpcConfig.region && resOut.vpcName === centralPhzConfig?.['resolver-vpc'],
    );
    if (!resolverRegionoutputs) {
      console.error(`Resolver rules are not Deployed in Central VPC Region ${zoneConfig.account}::${vpcConfig.region}`);
      continue;
    }

    let suffix: number;
    let stackSuffix: string;
    let newResource = true;

    // Load all account stacks to object
    if (!accountStaticResourcesConfig[accountKey]) {
      accountStaticResourcesConfig[accountKey] = allStaticResources.filter(sr => sr.accountKey === accountKey);
    }
    if (!accountRegionMaxSuffix[accountKey]) {
      accountRegionMaxSuffix[accountKey] = {};
    }

    // Load Max suffix for each region of account to object
    if (!accountRegionMaxSuffix[accountKey][vpcConfig.region]) {
      const localSuffix = accountStaticResourcesConfig[accountKey]
        .filter(sr => sr.region === vpcConfig.region)
        .flatMap(r => r.suffix);
      accountRegionMaxSuffix[accountKey][vpcConfig.region] = localSuffix.length === 0 ? 1 : Math.max(...localSuffix);
    }

    if (!accountRegionExistingResources[accountKey]) {
      const localRegionalResources = accountStaticResourcesConfig[accountKey]
        .filter(sr => sr.region === vpcConfig.region)
        .flatMap(sr => sr.resources);
      accountRegionExistingResources[accountKey] = {};
      accountRegionExistingResources[accountKey][vpcConfig.region] = localRegionalResources;
    } else if (!accountRegionExistingResources[accountKey][vpcConfig.region]) {
      const localRegionalResources = accountStaticResourcesConfig[accountKey]
        .filter(sr => sr.region === vpcConfig.region)
        .flatMap(sr => sr.resources);
      accountRegionExistingResources[accountKey][vpcConfig.region] = localRegionalResources;
    }

    suffix = accountRegionMaxSuffix[accountKey][vpcConfig.region];
    stackSuffix = `${STACK_COMMON_SUFFIX}-${suffix}`;
    const constructName = `${STACK_COMMON_SUFFIX}-${vpcConfig.name}`;
    if (accountRegionExistingResources[accountKey][vpcConfig.region].includes(constructName)) {
      newResource = false;
      const regionStacks = accountStaticResourcesConfig[accountKey].filter(sr => sr.region === vpcConfig.region);
      for (const rs of regionStacks) {
        if (rs.resources.includes(constructName)) {
          stackSuffix = `${STACK_COMMON_SUFFIX}-${rs.suffix}`;
          break;
        }
      }
    } else {
      const existingResources = accountStaticResourcesConfig[accountKey].find(
        sr => sr.region === vpcConfig.region && sr.suffix === suffix,
      );
      if (existingResources && existingResources.resources.length >= MAX_RESOURCES_IN_STACK) {
        accountRegionMaxSuffix[accountKey][vpcConfig.region] = ++suffix;
      }
      stackSuffix = `${STACK_COMMON_SUFFIX}-${suffix}`;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region, stackSuffix);
    if (!accountStack) {
      console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while Associating Resolver Rules`);
      continue;
    }

    const roleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'CentralEndpointDeployment',
    });
    if (!roleOutput) {
      continue;
    }

    const ruleIds = [...resolverRegionoutputs.rules?.madRules!, ...resolverRegionoutputs.rules?.onPremRules!];
    new AssociateResolverRules(accountStack, constructName, {
      resolverRuleIds: ruleIds,
      roleArn: roleOutput.roleArn,
      vpcId: vpcOutput.vpcId,
    });

    if (newResource) {
      const currentSuffixIndex = allStaticResources.findIndex(
        sr => sr.region === vpcConfig.region && sr.suffix === suffix && sr.accountKey === accountKey,
      );
      const currentAccountSuffixIndex = accountStaticResourcesConfig[accountKey].findIndex(
        sr => sr.region === vpcConfig.region && sr.suffix === suffix,
      );
      if (currentSuffixIndex === -1) {
        const currentResourcesObject = {
          accountKey,
          id: `${STACK_COMMON_SUFFIX}-${vpcConfig.region}-${accountKey}-${suffix}`,
          region: vpcConfig.region,
          resourceType: RESOURCE_TYPE,
          resources: [constructName],
          suffix,
        };
        allStaticResources.push(currentResourcesObject);
        accountStaticResourcesConfig[accountKey].push(currentResourcesObject);
      } else {
        const currentResourcesObject = allStaticResources[currentSuffixIndex];
        const currentAccountResourcesObject = accountStaticResourcesConfig[accountKey][currentAccountSuffixIndex];
        if (!currentResourcesObject.resources.includes(constructName)) {
          currentResourcesObject.resources.push(constructName);
        }
        if (!currentAccountResourcesObject.resources.includes(constructName)) {
          currentAccountResourcesObject.resources.push(constructName);
        }
        allStaticResources[currentSuffixIndex] = currentResourcesObject;
        accountStaticResourcesConfig[accountKey][currentAccountSuffixIndex] = currentAccountResourcesObject;
      }
    }
  }
  for (const sr of allStaticResources) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(
      sr.accountKey,
      sr.region,
      `${STACK_COMMON_SUFFIX}-${sr.suffix}`,
    );
    if (!accountStack) {
      throw new Error(
        `Not able to get or create stack for ${sr.accountKey}: ${sr.region}: ${STACK_COMMON_SUFFIX}-${sr.suffix}`,
      );
    }
    new CfnStaticResourcesOutput(accountStack, `StaticResourceOutput-${sr.suffix}`, sr);
  }
}
