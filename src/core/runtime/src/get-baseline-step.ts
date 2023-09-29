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

import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { IPv4CidrRange, IPv4Prefix, Pool } from 'ip-num';
import { v4 as uuidv4 } from 'uuid';
import {
  loadAssignedVpcCidrPool,
  loadAssignedSubnetCidrPool,
  loadCidrPools,
} from '@aws-accelerator/common/src/util/common';
import { getUpdateValueInput } from './utils/dynamodb-requests';
import { VpcConfig } from '@aws-accelerator/common-config';
import { AssignedVpcCidrPool } from '@aws-accelerator/common-outputs/src/cidr-pools';

export interface GetBaseLineInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  outputTableName: string;
  vpcCidrPoolAssignedTable: string;
  subnetCidrPoolAssignedTable: string;
  cidrPoolsTable: string;
  acceleratorVersion?: string;
  storeAllOutputs?: boolean;
}

export interface ConfigurationOrganizationalUnit {
  ouId: string;
  ouKey: string;
  ouName: string;
}

export interface GetBaseelineOutput {
  baseline: string;
  storeAllOutputs: boolean;
  phases: number[];
  organizationAdminRole: string;
}

const dynamoDB = new DynamoDB();

export interface AssignCidrInput {
  vpcCidrPoolAssignedTable: string;
  subnetCidrPoolAssignedTable: string;
  cidrPoolsTable: string;
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
}

/**
 * Step to return baseline from configuration, storeAllOutputs flag based on DDB entries in Outputs and OrgAdminRole name from Config
 * Run AssignDynamicCidrs to assign Cidr for VPC and Subnet if cidr-src is dynamic
 * @param input GetBaseLineInput
 * @returns GetBaseelineOutput
 */
export const handler = async (input: GetBaseLineInput): Promise<GetBaseelineOutput> => {
  console.log(`Loading configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    configFilePath,
    configRepositoryName,
    configCommitId,
    outputTableName,
    storeAllOutputs,
    cidrPoolsTable,
    subnetCidrPoolAssignedTable,
    vpcCidrPoolAssignedTable,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const globalOptionsConfig = config['global-options'];
  const baseline = globalOptionsConfig['ct-baseline'] ? 'CONTROL_TOWER' : 'ORGANIZATIONS';

  let runStoreAllOutputs: boolean = !!storeAllOutputs;
  if (!runStoreAllOutputs) {
    // Checking whether DynamoDB outputs table is empty or not
    runStoreAllOutputs = await dynamoDB.isEmpty(outputTableName);
  }

  await assignDynamicCidrs({
    configCommitId,
    configFilePath,
    configRepositoryName,
    cidrPoolsTable,
    subnetCidrPoolAssignedTable,
    vpcCidrPoolAssignedTable,
  });

  console.log(
    JSON.stringify(
      {
        baseline,
        storeAllOutputs: runStoreAllOutputs,
        phases: [-1, 0, 1, 2, 3],
      },
      null,
      2,
    ),
  );
  return {
    baseline,
    storeAllOutputs: runStoreAllOutputs,
    phases: [-1, 0, 1, 2, 3],
    organizationAdminRole: globalOptionsConfig['organization-admin-role'] || 'AWSCloudFormationStackSetExecutionRole',
  };
};

async function assignDynamicCidrs(input: AssignCidrInput) {
  const {
    cidrPoolsTable,
    configCommitId,
    configFilePath,
    configRepositoryName,
    subnetCidrPoolAssignedTable,
    vpcCidrPoolAssignedTable,
  } = input;
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const assignedSubnetCidrPools = await loadAssignedSubnetCidrPool(subnetCidrPoolAssignedTable);
  const cidrPools = await loadCidrPools(cidrPoolsTable);
  if (cidrPools.length === 0 && config['global-options']['cidr-pools'].length > 0) {
    // load cidrs from config to ddb
    for (const [index, configCidrPool] of Object.entries(config['global-options']['cidr-pools'])) {
      const updateExpression = getUpdateValueInput([
        {
          key: 'c',
          name: 'cidr',
          type: 'S',
          value: configCidrPool.cidr.toCidrString(),
        },
        {
          key: 'r',
          name: 'region',
          type: 'S',
          value: configCidrPool.region,
        },
        {
          key: 'p',
          name: 'pool',
          type: 'S',
          value: configCidrPool.pool,
        },
      ]);
      await dynamoDB.updateItem({
        TableName: cidrPoolsTable,
        Key: {
          id: { S: `${parseInt(index, 10) + 1}` },
        },
        ...updateExpression,
      });
    }
    cidrPools.push(...(await loadCidrPools(cidrPoolsTable)));
  }

  const lookupCidrs = async (
    accountKey: string,
    vpcConfig: VpcConfig,
    assignedVpcCidrPools: AssignedVpcCidrPool[],
    ouKey?: string,
  ) => {
    console.log('In lookupCidrs');
    let existingCidrs = assignedVpcCidrPools.filter(
      vp =>
        vp.region === vpcConfig.region &&
        vp['vpc-name'] === vpcConfig.name &&
        ((vp['account-Key'] && vp['account-Key'] === accountKey) || vp['account-ou-key'] === `account/${accountKey}`),
    );
    if (existingCidrs.length === 0) {
      existingCidrs = assignedVpcCidrPools.filter(
        vp =>
          vp.region === vpcConfig.region &&
          vp['vpc-name'] === vpcConfig.name &&
          vp['account-ou-key'] === `organizational-unit/${ouKey}`,
      );
    }

    if (existingCidrs.length === 0) {
      throw new Error(`VPC "${vpcConfig.region}/${vpcConfig.name}" Cidr-Src is lookup and didn't find entry in DDB`);
    }

    for (const existingCidr of existingCidrs) {
      if (existingCidr['account-ou-key'] === `organizational-unit/${ouKey}`) {
        await updateVpcCidr(vpcCidrPoolAssignedTable, uuidv4(), {
          accountOuKey: `account/${accountKey}`,
          cidr: existingCidr.cidr,
          pool: existingCidr.pool,
          region: vpcConfig.region,
          vpc: vpcConfig.name,
          accountKey,
          vpcAssignedId: `${existingCidr['vpc-assigned-id']}`,
        });
      }
    }

    for (const subnetConfig of vpcConfig.subnets || []) {
      for (const subnetDef of subnetConfig.definitions) {
        let existingSubnet = assignedSubnetCidrPools.find(
          sp =>
            sp['subnet-name'] === subnetConfig.name &&
            sp.az === subnetDef.az &&
            sp['vpc-name'] === vpcConfig.name &&
            sp.region === vpcConfig.region &&
            ((sp['account-Key'] && sp['account-Key'] === accountKey) ||
              sp['account-ou-key'] === `account/${accountKey}`),
        );
        if (!existingSubnet) {
          existingSubnet = assignedSubnetCidrPools.find(
            sp =>
              sp['subnet-name'] === subnetConfig.name &&
              sp.az === subnetDef.az &&
              sp['vpc-name'] === vpcConfig.name &&
              sp.region === vpcConfig.region &&
              sp['account-ou-key'] === `organizational-unit/${ouKey}`,
          );
        }
        if (!existingSubnet) {
          throw new Error(
            `Subnet "${vpcConfig.region}/${vpcConfig.name}/${subnetConfig.name}/${subnetDef.az}" Cidr-Src is lookup and didn't find entry in DDB`,
          );
        }

        if (existingSubnet['account-ou-key'] === `organizational-unit/${ouKey}`) {
          const az = subnetDef.az;
          await updateSubnetCidr(subnetCidrPoolAssignedTable, uuidv4(), {
            accountOuKey: `account/${accountKey}`,
            cidr: existingSubnet.cidr,
            pool: existingSubnet['sub-pool'],
            region: vpcConfig.region,
            vpc: vpcConfig.name,
            subnet: subnetConfig.name,
            az,
            accountKey,
          });
        }
      }
    }
    console.log('Finished lookupCidrs');
  };

  const dynamicCidrs = async (
    accountKey: string,
    vpcConfig: VpcConfig,
    assignedVpcCidrPools: AssignedVpcCidrPool[],
  ) => {
    console.log('In dynamicCidrs');
    const vpcCidr: { [key: string]: string } = {};
    for (const vpcCidrObj of vpcConfig.cidr) {
      const currentPool = cidrPools.find(cp => cp.region === vpcConfig.region && cp.pool === vpcCidrObj.pool);
      if (!currentPool) {
        throw new Error(`Didn't find entry for "${vpcCidrObj.pool}" in cidr-pools DDB table`);
      }
      const existingCidr = assignedVpcCidrPools.find(
        vp =>
          vp.region === vpcConfig.region &&
          vp['vpc-name'] === vpcConfig.name &&
          vp.pool === vpcCidrObj.pool &&
          ((vp['account-Key'] && vp['account-Key'] === accountKey) || vp['account-ou-key'] === `account/${accountKey}`),
      );
      if (!existingCidr) {
        const usedCidrs = assignedVpcCidrPools
          .filter(
            vp => vp.region === vpcConfig.region && vp.pool === vpcCidrObj.pool,
            // ((vp['account-Key'] && vp['account-Key'] === accountKey) ||
            //   vp['account-ou-key'] === `account/${accountKey}` ||
            //   (ouKey && vp['account-ou-key'] === `organizational-unit/${ouKey}`)),
          )
          .map(vp => vp.cidr);
        const pool = poolFromCidr(currentPool.cidr);
        const currentPoolCidrRange = pool.getCidrRange(IPv4Prefix.fromNumber(BigInt(vpcCidrObj.size!)));
        vpcCidr[vpcCidrObj.pool] = getAvailableCidr(usedCidrs, currentPoolCidrRange);
        if (
          IPv4CidrRange.fromCidr(currentPool.cidr)
            .getLast()
            .isLessThan(IPv4CidrRange.fromCidr(vpcCidr[vpcCidrObj.pool]).getFirst())
        ) {
          throw new Error(
            `Cidr Pool : "${currentPool.cidr} ran out of space while assigning for VPC: "${vpcConfig.region}/${vpcConfig.name}"`,
          );
        }
        await updateVpcCidr(vpcCidrPoolAssignedTable, uuidv4(), {
          accountOuKey: `account/${accountKey}`,
          cidr: vpcCidr[vpcCidrObj.pool],
          pool: vpcCidrObj.pool,
          region: vpcConfig.region,
          vpc: vpcConfig.name,
          accountKey,
        });
      } else {
        vpcCidr[vpcCidrObj.pool] = existingCidr.cidr;
      }
    }
    const usedSubnetCidrs = assignedSubnetCidrPools
      .filter(
        sp => sp.region === vpcConfig.region && sp['vpc-name'] === vpcConfig.name,
        // ((vp['account-Key'] && vp['account-Key'] === accountKey) ||
        //   vp['account-ou-key'] === `account/${accountKey}` ||
        //   (ouKey && vp['account-ou-key'] === `organizational-unit/${ouKey}`)),
      )
      .map(sp => sp.cidr);
    for (const subnetConfig of vpcConfig.subnets || []) {
      for (const subnetDef of subnetConfig.definitions) {
        if (!subnetDef.cidr) {
          throw new Error(
            `Didn't find Cidr in Configuration for Subnet "${accountKey}/${vpcConfig.name}/${subnetConfig.name}"`,
          );
        }
        console.log(
          `Creating Dynamic CIDR for "${subnetConfig.name}.${subnetDef.az}" of pool ${
            subnetDef.cidr.pool
          } with VPC Cidr ${vpcCidr[subnetDef.cidr.pool]}`,
        );
        const subnetPool = Pool.fromCidrRanges([IPv4CidrRange.fromCidr(vpcCidr[subnetDef.cidr.pool])]);
        let subnetCidr = '';
        const existingSubnet = assignedSubnetCidrPools.find(
          sp =>
            sp['subnet-name'] === subnetConfig.name &&
            sp.az === subnetDef.az &&
            sp['vpc-name'] === vpcConfig.name &&
            sp.region === vpcConfig.region &&
            ((sp['account-Key'] && sp['account-Key'] === accountKey) ||
              sp['account-ou-key'] === `account/${accountKey}`),
        );
        if (!existingSubnet) {
          const currentSubnetCidrRange = subnetPool.getCidrRange(IPv4Prefix.fromNumber(BigInt(subnetDef.cidr.size!)));
          subnetCidr = getAvailableCidr(usedSubnetCidrs, currentSubnetCidrRange);
          if (
            IPv4CidrRange.fromCidr(vpcCidr[subnetDef.cidr.pool])
              .getLast()
              .isLessThan(IPv4CidrRange.fromCidr(subnetCidr).getFirst())
          ) {
            throw new Error(
              `Error while creating dynamic CIDR for Subnets in VPC: "${vpcConfig.region}/${vpcConfig.name}"`,
            );
          }
          console.log(`Dynamic CIDR for "${subnetConfig.name}.${subnetDef.az}" is "${subnetCidr}"`);
          const az = subnetDef.az;
          await updateSubnetCidr(subnetCidrPoolAssignedTable, uuidv4(), {
            accountOuKey: `account/${accountKey}`,
            cidr: subnetCidr,
            pool: subnetDef.cidr.pool,
            region: vpcConfig.region,
            vpc: vpcConfig.name,
            subnet: subnetConfig.name,
            az,
            accountKey,
          });
        } else {
          subnetCidr = existingSubnet.cidr;
        }
      }
    }
    console.log('Finished dynamicCidrs');
  };

  // creating an IPv4 range from CIDR notation
  for (const { accountKey, vpcConfig, ouKey } of config.getVpcConfigs()) {
    if (vpcConfig['cidr-src'] === 'provided') {
      continue;
    }
    const assignedVpcCidrPools = await loadAssignedVpcCidrPool(vpcCidrPoolAssignedTable);
    console.log('Back from loadAssignedVpcCidrPool');
    if (vpcConfig['cidr-src'] === 'lookup') {
      await lookupCidrs(accountKey, vpcConfig, assignedVpcCidrPools, ouKey);
    } else if (vpcConfig['cidr-src'] === 'dynamic') {
      await dynamicCidrs(accountKey, vpcConfig, assignedVpcCidrPools);
    }
  }
}
function getAvailableCidr(usedCidrs: string[], currentPoolCidrRange: IPv4CidrRange): string {
  let alreadyUsed = false;
  do {
    for (const usedCidr of usedCidrs) {
      const usedCidrObj = IPv4CidrRange.fromCidr(usedCidr);
      if (
        usedCidrObj.isEquals(currentPoolCidrRange) ||
        usedCidrObj.contains(currentPoolCidrRange) ||
        currentPoolCidrRange.contains(usedCidrObj)
      ) {
        currentPoolCidrRange = currentPoolCidrRange.nextRange()!;
        alreadyUsed = true;
        break;
      } else {
        alreadyUsed = false;
      }
    }
  } while (alreadyUsed);
  usedCidrs.push(currentPoolCidrRange.toCidrString());
  return currentPoolCidrRange.toCidrString();
}

async function updateVpcCidr(tableName: string, id: string, input: { [key: string]: string }) {
  const updateExpression = getUpdateValueInput([
    {
      key: 'a',
      name: 'account-ou-key',
      type: 'S',
      value: input.accountOuKey,
    },
    {
      key: 'r',
      name: 'region',
      type: 'S',
      value: input.region,
    },
    {
      key: 'c',
      name: 'cidr',
      type: 'S',
      value: input.cidr,
    },
    {
      key: 'p',
      name: 'pool',
      type: 'S',
      value: input.pool,
    },
    {
      key: 're',
      name: 'requester',
      type: 'S',
      value: 'Accelerator',
    },
    {
      key: 's',
      name: 'status',
      type: 'S',
      value: 'assigned',
    },
    {
      key: 'v',
      name: 'vpc-name',
      type: 'S',
      value: input.vpc,
    },
    {
      key: 'ak',
      name: 'account-key',
      type: 'S',
      value: input.accountKey,
    },
    {
      key: 'vi',
      name: 'vpc-assigned-id',
      type: 'N',
      value: input.vpcAssignedId,
    },
  ]);
  await dynamoDB.updateItem({
    TableName: tableName,
    Key: {
      id: { S: id },
    },
    ...updateExpression,
  });
}

async function updateSubnetCidr(tableName: string, id: string, input: { [key: string]: string }) {
  const updateExpression = getUpdateValueInput([
    {
      key: 'a',
      name: 'account-ou-key',
      type: 'S',
      value: input.accountOuKey,
    },
    {
      key: 'r',
      name: 'region',
      type: 'S',
      value: input.region,
    },
    {
      key: 'c',
      name: 'cidr',
      type: 'S',
      value: input.cidr,
    },
    {
      key: 'p',
      name: 'subnet-pool',
      type: 'S',
      value: input.pool,
    },
    {
      key: 're',
      name: 'requester',
      type: 'S',
      value: 'Accelerator',
    },
    {
      key: 's',
      name: 'status',
      type: 'S',
      value: 'assigned',
    },
    {
      key: 'v',
      name: 'vpc-name',
      type: 'S',
      value: input.vpc,
    },
    {
      key: 'sn',
      name: 'subnet-name',
      type: 'S',
      value: input.subnet,
    },
    {
      key: 'az',
      name: 'az',
      type: 'S',
      value: input.az,
    },
  ]);
  await dynamoDB.updateItem({
    TableName: tableName,
    Key: {
      id: { S: id },
    },
    ...updateExpression,
  });
}

function poolFromCidr(cidr: string) {
  try {
    return Pool.fromCidrRanges([IPv4CidrRange.fromCidr(cidr)]);
  } catch (e) {
    throw new Error(`Error while generating pool for cidr "${cidr}": ${e}`);
  }
}
