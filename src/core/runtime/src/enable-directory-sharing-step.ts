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

import { DirectoryService } from '@aws-accelerator/common/src/aws/directory-service';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { MadOutput } from '@aws-accelerator/common-outputs/src/mad';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { loadOutputs } from './utils/load-outputs';
import { loadAccounts } from './utils/load-accounts';

interface ShareDirectoryInput extends LoadConfigurationInput {
  parametersTableName: string;
  assumeRoleName: string;
  outputTableName: string;
}

const dynamodb = new DynamoDB();

export const handler = async (input: ShareDirectoryInput) => {
  console.log(`Sharing MAD to another account ...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    parametersTableName,
    assumeRoleName,
    configRepositoryName,
    configFilePath,
    configCommitId,
    outputTableName,
  } = input;

  const accounts = await loadAccounts(parametersTableName, dynamodb);
  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const outputs = await loadOutputs(outputTableName, dynamodb);

  const sts = new STS();

  const shareDirectory = async (
    ownerAccountId: string,
    directoryId: string,
    shareToAccountId?: string,
  ): Promise<void> => {
    const credentials = await sts.getCredentialsForAccountAndRole(ownerAccountId, assumeRoleName);
    const directoryService = new DirectoryService(credentials);
    const sharedAccounts = await directoryService.findSharedAccounts({ OwnerDirectoryId: directoryId });

    if (shareToAccountId && !sharedAccounts.includes(shareToAccountId)) {
      const sharedDirectoryId = await directoryService.shareDirectory({
        DirectoryId: directoryId,
        ShareMethod: 'HANDSHAKE',
        ShareTarget: {
          Id: shareToAccountId,
          Type: 'ACCOUNT',
        },
      });

      if (sharedDirectoryId) {
        console.log('Accepting the request from shared account');
        const sharedAccountCredentials = await sts.getCredentialsForAccountAndRole(shareToAccountId, assumeRoleName);
        const sharedAccountDirectoryService = new DirectoryService(sharedAccountCredentials);
        await sharedAccountDirectoryService.acceptDirectory({
          SharedDirectoryId: sharedDirectoryId,
        });
      }
    }
  };

  const accountConfigs = acceleratorConfig.getAccountConfigs();
  for (const [accountKey, mandatoryConfig] of accountConfigs) {
    const madConfig = mandatoryConfig.deployments?.mad;
    if (!madConfig || !madConfig.deploy) {
      continue;
    }

    const madOutputs: MadOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'MadOutput',
    });

    const madOutput = madOutputs.find(output => output.id === madConfig['dir-id']);
    if (!madOutput || !madOutput.directoryId) {
      console.warn(`Cannot find madOutput with vpc name ${madConfig['vpc-name']}`);
      continue;
    }

    const directoryId = madOutput.directoryId;

    const accountId = getAccountId(accounts, accountKey);

    if (!accountId) {
      console.warn(`Cannot find account with key ${accountKey}`);
      continue;
    }

    if (madConfig['share-to-account']) {
      const shareToAccountId = getAccountId(accounts, madConfig['share-to-account']);
      await shareDirectory(accountId, directoryId, shareToAccountId);
    }
  }

  const shareMadToAccounts: { accountKey: string; ownerAccountKey: string }[] = [];

  // Below code will find sharing of MAD to specific accounts
  for (const [accountKey, mandatoryConfig] of Object.values(accountConfigs)) {
    const sharedMadAccount = mandatoryConfig['share-mad-from'];
    if (!sharedMadAccount) {
      continue;
    }
    shareMadToAccounts.push({ accountKey, ownerAccountKey: sharedMadAccount });
  }

  // Below code will find accounts that are shared to OUs
  const oUs = acceleratorConfig.getOrganizationalUnits();
  for (const [ouKey, ou] of Object.values(oUs)) {
    console.log('ouKey', ouKey);
    const sharedMadOu = ou['share-mad-from'];
    if (!sharedMadOu) {
      continue;
    }
    const ouAccountConfigs = acceleratorConfig.getAccountConfigsForOu(ouKey);
    for (const [accountKey] of Object.values(ouAccountConfigs)) {
      shareMadToAccounts.push({ accountKey, ownerAccountKey: sharedMadOu });
    }
  }

  console.log('shareMadToAccounts', shareMadToAccounts);

  // sharing MAD based on account settings
  for (const shareMadToAccount of Object.values(shareMadToAccounts)) {
    const accountKey = shareMadToAccount.accountKey;
    const ownerAccountKey = shareMadToAccount.ownerAccountKey;

    const ownerAccountConfig = accountConfigs.find(([key]) => key === ownerAccountKey);
    if (!ownerAccountConfig) {
      console.warn(`Cannot find Owner account config with key ${ownerAccountKey}`);
      continue;
    }

    const madDirId = ownerAccountConfig[1].deployments?.mad?.['dir-id'];
    if (!madDirId) {
      console.warn(`Cannot find dir-id for Owner account with key ${ownerAccountKey}`);
      continue;
    }

    const madOutputs: MadOutput[] = getStackJsonOutput(outputs, {
      accountKey: ownerAccountKey,
      outputType: 'MadOutput',
    });

    const madOutput = madOutputs.find(output => output.id === madDirId);
    if (!madOutput || !madOutput.directoryId) {
      console.warn(`Cannot find madOutput with dir-id ${madDirId}`);
      continue;
    }

    const directoryId = madOutput.directoryId;
    let sharedAccountId;
    const ownerAccountId = getAccountId(accounts, ownerAccountKey);

    if (!ownerAccountId) {
      console.warn(`Cannot find account with accountKey ${ownerAccountKey}`);
      continue;
    }

    try {
      sharedAccountId = getAccountId(accounts, accountKey);
    } catch (e) {
      console.warn(`Cannot find account with key ${accountKey}`);
    }

    if (!sharedAccountId) {
      console.warn(`Cannot find account with accountKey ${accountKey}`);
      continue;
    }

    await shareDirectory(ownerAccountId, directoryId, sharedAccountId);
  }
};
