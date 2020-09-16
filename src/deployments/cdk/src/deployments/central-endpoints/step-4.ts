import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import * as c from '@aws-accelerator/common-config';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { HostedZoneOutputFinder } from '@aws-accelerator/common-outputs/src/hosted-zone';
import { Account, getAccountId } from '../../utils/accounts';
import { AssociateHostedZones } from '@aws-accelerator/custom-resource-associate-hosted-zones';
import * as cdk from '@aws-cdk/core';
import { StaticResource } from '../../utils/static-resources';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';

export interface CentralEndpointsStep4Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  accounts: Account[];
  executionRole: string;
  assumeRole: string;
  staticResources: StaticResource[];
  acceleratorExecutionRoleName: string;
  resourcesTableName: string;
}

/**
 *  Associate VPC to Hosted Zones to Vpcs based on use-central-endpoints
 */
export async function step4(props: CentralEndpointsStep4Props) {
  const {
    accountStacks,
    config,
    outputs,
    accounts,
    assumeRole,
    executionRole,
    staticResources,
    acceleratorExecutionRoleName,
    resourcesTableName,
  } = props;
  const allVpcConfigs = config.getVpcConfigs();
  const zonesConfig = config['global-options'].zones;
  const globalPrivateHostedZoneIds: string[] = [];
  const centralZoneConfig = zonesConfig.find(z => z.names);
  const masterAccountKey = config['global-options']['aws-org-master'].account;
  if (centralZoneConfig) {
    const hostedZoneOutputs = HostedZoneOutputFinder.findAll({
      outputs,
      accountKey: centralZoneConfig.account,
      region: centralZoneConfig.region,
    });
    const centralVpcHostedZones = hostedZoneOutputs.filter(hzo => hzo.vpcName === centralZoneConfig['resolver-vpc']);
    if (centralVpcHostedZones) {
      globalPrivateHostedZoneIds.push(
        ...centralVpcHostedZones
          .filter(cvh => centralZoneConfig.names?.private.includes(cvh.domain))
          .map(hz => hz.hostedZoneId),
      );
    }
  }

  const masterAccountId = getAccountId(accounts, masterAccountKey)!;

  const sts = new STS();
  const masterAcctCredentials = await sts.getCredentialsForAccountAndRole(
    masterAccountId,
    acceleratorExecutionRoleName,
  );

  const dynamodb = new DynamoDB(masterAcctCredentials);

  const existingRegionResources: { [region: string]: string[] } = {};
  const updateStackResources: StaticResource[] = [];
  const supportedregions = config['global-options']['supported-regions'];

  const regionalMaxSuffix: { [region: string]: number } = {};
  supportedregions.forEach(reg => {
    const localSuffix = staticResources
      .filter(sr => sr.resourceType === 'HostedZoneAssociation' && sr.region === reg)
      .flatMap(r => r.suffix);
    regionalMaxSuffix[reg] = localSuffix.length === 0 ? 1 : Math.max(...localSuffix);
  });

  supportedregions.forEach(reg => {
    existingRegionResources[reg] = staticResources
      .filter(sr => sr.region === reg && sr.resourceType === 'HostedZoneAssociation')
      .flatMap(r => r.resources);
  });

  for (const { accountKey, vpcConfig } of allVpcConfigs) {
    let seperateGlobalHostedZonesAccount = true;
    if (!vpcConfig['use-central-endpoints']) {
      continue;
    }
    if (
      centralZoneConfig?.account === accountKey &&
      centralZoneConfig.region === vpcConfig.region &&
      centralZoneConfig['resolver-vpc'] === vpcConfig.name
    ) {
      console.info(
        `Current VPC "${accountKey}: ${vpcConfig.region}: ${vpcConfig.name}" is Central VPC so no need to associate`,
      );
      continue;
    }

    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      region: vpcConfig.region,
      vpcName: vpcConfig.name,
    });
    if (!vpcOutput) {
      console.warn(`Cannot find VPC "${vpcConfig.name}" in outputs`);
      continue;
    }

    let suffix = regionalMaxSuffix[vpcConfig.region];
    const existingResources = staticResources.find(
      sr =>
        sr.region === vpcConfig.region &&
        sr.suffix === suffix &&
        sr.resourceType === `HostedZoneAssociation` &&
        sr.accountKey === masterAccountKey,
    );
    if (existingResources && existingResources.resources.length >= 2) {
      regionalMaxSuffix[vpcConfig.region] = ++suffix;
    }

    let stackSuffix = `HostedZonesAssc-${suffix}`;
    let updateDbRequired = true;
    const constructName = `AssociateHostedZones-${accountKey}-${vpcConfig.name}-${vpcConfig.region}`;
    const phzConstructName = `AssociatePrivateZones-${accountKey}-${vpcConfig.name}-${vpcConfig.region}`;
    if (existingRegionResources[vpcConfig.region].includes(constructName)) {
      updateDbRequired = false;
      const regionStacks = staticResources.filter(
        sr =>
          sr.region === vpcConfig.region &&
          sr.resourceType === 'HostedZoneAssociation' &&
          sr.accountKey === masterAccountKey,
      );
      for (const rs of regionStacks) {
        if (rs.resources.includes(constructName)) {
          stackSuffix = `HostedZonesAssc-${rs.suffix}`;
          break;
        }
      }
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(masterAccountKey, vpcConfig.region, stackSuffix);
    if (!accountStack) {
      console.error(`Cannot find account stack ${accountKey}: ${vpcConfig.region}, while Associating Resolver Rules`);
      continue;
    }

    const vpcAccountId = getAccountId(accounts, accountKey)!;

    const zoneConfig = zonesConfig.find(zc => zc.region === vpcConfig.region);
    const hostedZoneIds: string[] = [];
    if (zoneConfig) {
      // Retriving Hosted Zone ids for interface endpoints to be shared
      hostedZoneIds.push(...getHostedZoneIds(allVpcConfigs, zoneConfig, vpcConfig, outputs));
      if (zoneConfig.account === centralZoneConfig?.account) {
        seperateGlobalHostedZonesAccount = false;
        hostedZoneIds.push(...globalPrivateHostedZoneIds);
      }
      const hostedZoneAccountId = getAccountId(accounts, zoneConfig.account)!;
      new AssociateHostedZones(accountStack, constructName, {
        assumeRoleName: assumeRole,
        vpcAccountId,
        vpcName: vpcConfig.name,
        vpcId: vpcOutput.vpcId,
        vpcRegion: vpcConfig.region,
        hostedZoneAccountId,
        hostedZoneIds,
        roleArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${executionRole}`,
      });
    } else {
      console.warn(`No Central VPC found for region "${vpcConfig.region}"`);
    }

    if (seperateGlobalHostedZonesAccount) {
      const hostedZoneAccountId = getAccountId(accounts, centralZoneConfig?.account!)!;
      new AssociateHostedZones(accountStack, phzConstructName, {
        assumeRoleName: assumeRole,
        vpcAccountId,
        vpcName: vpcConfig.name,
        vpcId: vpcOutput.vpcId,
        vpcRegion: vpcConfig.region,
        hostedZoneAccountId,
        hostedZoneIds: globalPrivateHostedZoneIds,
        roleArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${executionRole}`,
      });
    }

    // Update stackResources Object if new resource came
    if (updateDbRequired) {
      const currentSuffixIndex = staticResources.findIndex(
        sr =>
          sr.region === vpcConfig.region &&
          sr.suffix === suffix &&
          sr.resourceType === 'HostedZoneAssociation' &&
          sr.accountKey === masterAccountKey,
      );
      const localUpdateIndex = updateStackResources.findIndex(
        sr =>
          sr.region === vpcConfig.region &&
          sr.suffix === suffix &&
          sr.resourceType === 'HostedZoneAssociation' &&
          sr.accountKey === masterAccountKey,
      );
      const vpcAssociationResources = [constructName];
      if (seperateGlobalHostedZonesAccount) {
        vpcAssociationResources.push(phzConstructName);
      }
      if (currentSuffixIndex === -1) {
        staticResources.push({
          accountKey: masterAccountKey,
          id: `AssociateHostedZones-${vpcConfig.region}-${masterAccountKey}-${suffix}`,
          region: vpcConfig.region,
          resourceType: 'HostedZoneAssociation',
          resources: vpcAssociationResources,
          suffix,
        });
      } else {
        const currentResourcesObject = staticResources[currentSuffixIndex];
        currentResourcesObject.resources.push(...vpcAssociationResources);
        staticResources[currentSuffixIndex] = currentResourcesObject;
      }
      if (localUpdateIndex === -1) {
        updateStackResources.push({
          accountKey: masterAccountKey,
          id: `AssociateHostedZones-${vpcConfig.region}-${masterAccountKey}-${suffix}`,
          region: vpcConfig.region,
          resourceType: 'HostedZoneAssociation',
          resources: vpcAssociationResources,
          suffix,
        });
      } else {
        const currentResourcesObject = updateStackResources[currentSuffixIndex];
        currentResourcesObject.resources.push(...vpcAssociationResources);
        updateStackResources[currentSuffixIndex] = currentResourcesObject;
      }
    }
  }

  for (const staticResource of updateStackResources) {
    const updateExpression = dynamodb.getUpdateValueInput([
      {
        key: 'a',
        name: 'accountKey',
        type: 'S',
        value: staticResource.accountKey,
      },
      {
        key: 'r',
        name: 'region',
        type: 'S',
        value: staticResource.region,
      },
      {
        key: 'p',
        name: 'suffix',
        type: 'N',
        value: `${staticResource.suffix}`,
      },
      {
        key: 'res',
        name: 'resources',
        type: 'S',
        value: JSON.stringify(staticResource.resources),
      },
      {
        key: 'rt',
        name: 'resourceType',
        type: 'S',
        value: staticResource.resourceType,
      },
    ]);
    await dynamodb.updateItem({
      TableName: resourcesTableName,
      Key: {
        id: { S: staticResource.id },
      },
      ...updateExpression,
    });
  }
}

function getHostedZoneIds(
  allVpcConfigs: c.ResolvedVpcConfig[],
  zoneConfig: c.GlobalOptionsZonesConfig,
  vpcConfig: c.VpcConfig,
  outputs: StackOutput[],
): string[] {
  // Retriving Hosted Zone ids for interface endpoints to be shared
  const centralRegionalVpcConfig = allVpcConfigs.find(
    vc =>
      vc.accountKey === zoneConfig.account &&
      vc.vpcConfig.name === zoneConfig['resolver-vpc'] &&
      vc.vpcConfig.region === zoneConfig.region,
  );
  if (!centralRegionalVpcConfig) {
    console.error(
      `VPC configuration not found for Central configuraiton "${zoneConfig.account}: ${zoneConfig.region}: ${zoneConfig['resolver-vpc']}" `,
    );
    return [];
  }
  const centralEndpoints: string[] = [];
  const localEndpoints: string[] = [];

  // Get Endpoints from Central VPC Config
  if (c.InterfaceEndpointConfig.is(centralRegionalVpcConfig.vpcConfig['interface-endpoints'])) {
    centralEndpoints.push(...centralRegionalVpcConfig.vpcConfig['interface-endpoints'].endpoints);
  }

  // Get Endpoints from Local VPC Config
  if (c.InterfaceEndpointConfig.is(vpcConfig['interface-endpoints'])) {
    localEndpoints.push(...vpcConfig['interface-endpoints'].endpoints);
  }
  const shareableEndpoints = centralEndpoints.filter(ce => !localEndpoints.includes(ce));
  const hostedZoneIds: string[] = [];
  const regionalHostedZoneOutputs = HostedZoneOutputFinder.findAll({
    outputs,
    accountKey: zoneConfig.account,
    region: zoneConfig.region,
  });
  const vpcHostedZoneOutputs = regionalHostedZoneOutputs.filter(hz => hz.vpcName === zoneConfig['resolver-vpc']);
  hostedZoneIds.push(
    ...vpcHostedZoneOutputs
      .filter(hz => hz.serviceName && shareableEndpoints.includes(hz.serviceName))
      .map(h => h.hostedZoneId),
  );
  return hostedZoneIds;
}
