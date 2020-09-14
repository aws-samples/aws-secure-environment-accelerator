import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import * as c from '@aws-accelerator/common-config';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { HostedZoneOutputFinder } from '@aws-accelerator/common-outputs/src/hosted-zone';
import { Account, getAccountId } from '../../utils/accounts';
import { AssociateHostedZones } from '@aws-accelerator/custom-resource-associate-hosted-zones';
import * as cdk from '@aws-cdk/core';

export interface CentralEndpointsStep4Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  accounts: Account[];
  executionRole: string;
  assumeRole: string;
}

/**
 *  Associate VPC to Hosted Zones to Vpcs based on use-central-endpoints
 */
export async function step4(props: CentralEndpointsStep4Props) {
  const { accountStacks, config, outputs, accounts, assumeRole, executionRole } = props;
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

  const regionAssociationCounter: { [region: string]: number } = {};

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

    if (regionAssociationCounter[vpcConfig.region]) {
      regionAssociationCounter[vpcConfig.region] = ++regionAssociationCounter[vpcConfig.region];
    } else {
      regionAssociationCounter[vpcConfig.region] = 1;
    }

    const stackSuffix = `HostedZonesAssc-${Math.ceil(regionAssociationCounter[vpcConfig.region] / 2)}`;

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

      new AssociateHostedZones(
        accountStack,
        `AssociateHostedZones-${accountKey}-${vpcConfig.name}-${vpcConfig.region}`,
        {
          assumeRoleName: assumeRole,
          vpcAccountId,
          vpcName: vpcConfig.name,
          vpcId: vpcOutput.vpcId,
          vpcRegion: vpcConfig.region,
          hostedZoneAccountId,
          hostedZoneIds,
          roleArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${executionRole}`,
        },
      );
    } else {
      console.warn(`No Central VPC found for region "${vpcConfig.region}"`);
    }

    if (seperateGlobalHostedZonesAccount) {
      const hostedZoneAccountId = getAccountId(accounts, centralZoneConfig?.account!)!;

      new AssociateHostedZones(
        accountStack,
        `AssociatePrivateZones-${accountKey}-${vpcConfig.name}-${vpcConfig.region}`,
        {
          assumeRoleName: assumeRole,
          vpcAccountId,
          vpcName: vpcConfig.name,
          vpcId: vpcOutput.vpcId,
          vpcRegion: vpcConfig.region,
          hostedZoneAccountId,
          hostedZoneIds: globalPrivateHostedZoneIds,
          roleArn: `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/${executionRole}`,
        },
      );
    }
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
