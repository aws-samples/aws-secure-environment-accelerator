import { AcceleratorConfig, InterfaceEndpointConfig } from '@aws-accelerator/common-config';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import {
  StaticResourcesOutput,
  StaticResourcesOutputFinder,
} from '@aws-accelerator/common-outputs/src/static-resource';
import { AccountStacks } from '../../common/account-stacks';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { CfnHostedZoneOutput, CfnStaticResourcesOutput } from '../central-endpoints';
import { InterfaceEndpoint } from '../../common/interface-endpoints';
import { pascalCase } from 'pascal-case';
import { Limit, Limiter } from '../../utils/limits';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';

// Changing this will result to redeploy most of the stack
const MAX_RESOURCES_IN_STACK = 30;
const RESOURCE_TYPE = 'INTERFACE_ENDPOINTS';
const STACK_SUFFIX = 'VPCEndpoints';

interface VpcStep3Props {
  config: AcceleratorConfig;
  outputs: StackOutput[];
  accountStacks: AccountStacks;
  limiter: Limiter;
}

export async function step3(props: VpcStep3Props) {
  const { config, outputs, accountStacks, limiter } = props;
  const allStaticResources = StaticResourcesOutputFinder.findAll({
    outputs,
  }).filter(sr => sr.resourceType === RESOURCE_TYPE);

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

  // Initiate previous stacks to handle deletion of previously deployed stack if there are no resources
  for (const sr of allStaticResources) {
    accountStacks.tryGetOrCreateAccountStack(sr.accountKey, sr.region, `${STACK_SUFFIX}-${sr.suffix}`);
  }

  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    if (!InterfaceEndpointConfig.is(vpcConfig['interface-endpoints'])) {
      continue;
    }
    const endpointsConfig = vpcConfig['interface-endpoints'];

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

    let suffix: number;
    let stackSuffix: string;

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

    const regionStacks = accountStaticResourcesConfig[accountKey].filter(sr => sr.region === vpcConfig.region);

    // Get Account & Region Current Max Suffix and update it when it is changed
    suffix = accountRegionMaxSuffix[accountKey][vpcConfig.region];
    stackSuffix = `${STACK_SUFFIX}-${suffix}`;

    for (const endpoint of endpointsConfig.endpoints) {
      let newResource = true;
      if (!limiter.create(accountKey, Limit.VpcInterfaceEndpointsPerVpc, vpcConfig.region, vpcConfig.name)) {
        console.log(
          `Skipping endpoint "${endpoint}" creation in VPC "${vpcConfig.name}". Reached maximum interface endpoints per VPC`,
          accountKey,
          vpcConfig.region,
        );
        continue;
      }
      const constructName = `${STACK_SUFFIX}-${vpcConfig.name}-${endpoint}`;
      if (accountRegionExistingResources[accountKey][vpcConfig.region].includes(constructName)) {
        newResource = false;
        const currentStaticResource = regionStacks.find(rs => rs.resources.includes(constructName));
        if (currentStaticResource) {
          stackSuffix = `${STACK_SUFFIX}-${currentStaticResource.suffix}`;
        }
      } else {
        const existingResources = accountStaticResourcesConfig[accountKey].find(
          sr => sr.region === vpcConfig.region && sr.suffix === suffix,
        );
        if (existingResources && existingResources.resources.length >= MAX_RESOURCES_IN_STACK) {
          // Updating Account & Region Max Suffix
          accountRegionMaxSuffix[accountKey][vpcConfig.region] = ++suffix;
        }
        stackSuffix = `${STACK_SUFFIX}-${suffix}`;
      }

      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region, stackSuffix);
      if (!accountStack) {
        console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while Associating Resolver Rules`);
        continue;
      }

      const interfaceEndpoint = new InterfaceEndpoint(
        accountStack,
        `Endpoint-${vpcConfig.name}-${pascalCase(endpoint)}`,
        {
          serviceName: endpoint,
          vpcId: vpcOutput.vpcId,
          vpcRegion: vpcConfig.region,
          subnetIds: vpcOutput.subnets.filter(sn => sn.subnetName === endpointsConfig.subnet).map(s => s.subnetId),
        },
      );

      new CfnHostedZoneOutput(accountStack, `HostedZoneOutput-${vpcConfig.name}-${pascalCase(endpoint)}`, {
        accountKey,
        domain: interfaceEndpoint.hostedZone.name,
        hostedZoneId: interfaceEndpoint.hostedZone.ref,
        region: vpcConfig.region,
        zoneType: 'PRIVATE',
        serviceName: endpoint,
        vpcName: vpcConfig.name,
      });

      if (newResource) {
        const currentSuffixIndex = allStaticResources.findIndex(
          sr => sr.region === vpcConfig.region && sr.suffix === suffix && sr.accountKey === accountKey,
        );
        const currentAccountSuffixIndex = accountStaticResourcesConfig[accountKey].findIndex(
          sr => sr.region === vpcConfig.region && sr.suffix === suffix,
        );
        if (currentSuffixIndex === -1) {
          const currentResourcesObject: StaticResourcesOutput = {
            accountKey,
            id: `${STACK_SUFFIX}-${vpcConfig.region}-${accountKey}-${suffix}`,
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
  }
  for (const sr of allStaticResources) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(
      sr.accountKey,
      sr.region,
      `${STACK_SUFFIX}-${sr.suffix}`,
    );
    if (!accountStack) {
      throw new Error(
        `Not able to get or create stack for ${sr.accountKey}: ${sr.region}: ${STACK_SUFFIX}-${sr.suffix}`,
      );
    }
    new CfnStaticResourcesOutput(accountStack, `StaticResourceOutput-${sr.suffix}`, sr);
  }
}
