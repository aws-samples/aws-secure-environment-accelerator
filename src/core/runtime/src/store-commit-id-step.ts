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

import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import { getCommitIdSecretName } from '@aws-accelerator/common-outputs/src/commitid-secret';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { loadAssignedSubnetCidrPool, loadAssignedVpcCidrPool } from '@aws-accelerator/common/src/util/common';
import { loadOutputs } from './utils/load-outputs';
import { loadAccounts } from './utils/load-accounts';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { getAssigndVpcCidrs, getAssigndVpcSubnetCidrs } from '@aws-accelerator/common-config/src/compare/common';
import { getUpdateValueInput } from './utils/dynamodb-requests';
import { getAccountId } from '@aws-accelerator/common-outputs/src/accounts';

export interface StepInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  acceleratorVersion: string;
  outputTableName: string;
  vpcCidrPoolAssignedTable: string;
  subnetCidrPoolAssignedTable: string;
  parametersTableName: string;
}

const dynamodb = new DynamoDB();

export const handler = async (input: StepInput): Promise<void> => {
  console.log(`Store previous commitId...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    configCommitId,
    acceleratorVersion,
    vpcCidrPoolAssignedTable,
    subnetCidrPoolAssignedTable,
    configFilePath,
    configRepositoryName,
    outputTableName,
    parametersTableName,
  } = input;
  const commitSecretId = getCommitIdSecretName();

  // Store the git repository config file commit id in the secrets manager
  const secrets = new SecretsManager();
  let previousCommitIdSecret;
  try {
    previousCommitIdSecret = await secrets.getSecret(commitSecretId);
  } catch (e) {
    console.log('previous successful run commitId secret not found');
  }

  const secretValue = {
    configCommitId,
    acceleratorVersion,
  };

  if (!previousCommitIdSecret) {
    await secrets.createSecret({
      Name: commitSecretId,
      SecretString: JSON.stringify(secretValue),
      Description: 'This secret contains the last successful commit ID of the Git repository configuration file',
    });
  } else {
    await secrets.putSecretValue({
      SecretId: commitSecretId,
      SecretString: JSON.stringify(secretValue),
    });
  }

  // Update Cidr entries
  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  await updateCidrs({
    config,
    outputTableName,
    parametersTableName,
    subnetCidrPoolAssignedTable,
    vpcCidrPoolAssignedTable,
  });

  const backupTime = new Date().getTime();
  await dynamodb.createBackup({
    TableName: vpcCidrPoolAssignedTable,
    BackupName: `${vpcCidrPoolAssignedTable}-${backupTime}`,
  });

  await dynamodb.createBackup({
    TableName: subnetCidrPoolAssignedTable,
    BackupName: `${subnetCidrPoolAssignedTable}-${backupTime}`,
  });
};

async function updateCidrs(params: {
  config: AcceleratorConfig;
  vpcCidrPoolAssignedTable: string;
  subnetCidrPoolAssignedTable: string;
  outputTableName: string;
  parametersTableName: string;
}) {
  const {
    config,
    outputTableName,
    parametersTableName,
    subnetCidrPoolAssignedTable,
    vpcCidrPoolAssignedTable,
  } = params;
  const assignedVpcCidrPools = await loadAssignedVpcCidrPool(vpcCidrPoolAssignedTable);
  const assignedSubnetCidrPools = await loadAssignedSubnetCidrPool(subnetCidrPoolAssignedTable);
  const outputs = await loadOutputs(outputTableName, dynamodb);
  const accounts = await loadAccounts(parametersTableName, dynamodb);
  for (const { accountKey, vpcConfig, ouKey } of config.getVpcConfigs()) {
    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      vpcName: vpcConfig.name,
      accountKey,
      region: vpcConfig.region,
    });
    if (!vpcOutput) {
      console.warn(`Cannot find output with vpc name "${accountKey}/${vpcConfig.region}/${vpcConfig.name}"`);
      continue;
    }
    const vpcPools = getAssigndVpcCidrs(assignedVpcCidrPools, accountKey, vpcConfig.name, vpcConfig.region);
    const subnetPools = getAssigndVpcSubnetCidrs(assignedSubnetCidrPools, accountKey, vpcConfig.name, vpcConfig.region);
    const accountId = getAccountId(accounts, accountKey);
    if (vpcPools.length !== 0) {
      for (const vpcPool of vpcPools) {
        if (vpcPool['vpc-id'] && vpcPool['account-id'] && vpcPool['account-Key']) {
          continue;
        }
        const updateExpression = getUpdateValueInput([
          {
            key: 'a',
            name: 'account-id',
            type: 'S',
            value: accountId!,
          },
          {
            key: 'vid',
            name: 'vpc-id',
            type: 'S',
            value: vpcOutput.vpcId,
          },
          {
            key: 'ak',
            name: 'account-key',
            type: 'S',
            value: accountKey,
          },
        ]);
        await dynamodb.updateItem({
          TableName: vpcCidrPoolAssignedTable,
          Key: {
            id: { S: vpcPool.id },
          },
          ...updateExpression,
        });
      }
    }
    if (subnetPools.length !== 0) {
      for (const subnetPool of subnetPools) {
        if (subnetPool['subnet-id'] && subnetPool['account-id'] && subnetPool['vpc-id'] && subnetPool['account-Key']) {
          continue;
        }
        const subnetOutput = vpcOutput.subnets.find(
          s => s.subnetName === subnetPool['subnet-name'] && s.az === subnetPool.az,
        );
        if (!subnetOutput) {
          continue;
        }
        const updateExpression = getUpdateValueInput([
          {
            key: 'a',
            name: 'account-id',
            type: 'S',
            value: accountId!,
          },
          {
            key: 'vid',
            name: 'vpc-id',
            type: 'S',
            value: vpcOutput.vpcId,
          },
          {
            key: 'sid',
            name: 'subnet-id',
            type: 'S',
            value: subnetOutput.subnetId,
          },
          {
            key: 'ak',
            name: 'account-key',
            type: 'S',
            value: accountKey,
          },
        ]);
        await dynamodb.updateItem({
          TableName: subnetCidrPoolAssignedTable,
          Key: {
            id: { S: subnetPool.id },
          },
          ...updateExpression,
        });
      }
    }
  }
}
