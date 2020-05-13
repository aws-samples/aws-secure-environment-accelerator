import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getAccountId } from '../../templates/src/utils/accounts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { LoadConfigurationInput } from './load-configuration-step';

interface ShareDirectoryInput extends LoadConfigurationInput {
  accounts: Account[];
  stackOutputSecretId: string;
  assumeRoleName: string;
}

interface MadOutput {
  id: number;
  vpcName: string;
  directoryId: string;
  dnsIps: string;
  passwordArn: string;
}

export const handler = async (input: ShareDirectoryInput) => {
  console.log(`Sharing MAD to another account ...`);
  console.log(JSON.stringify(input, null, 2));

  const { 
    accounts, 
    assumeRoleName, 
    stackOutputSecretId, 
    configRepositoryName,
    configFilePath,
    configCommitId
   } = input;

  const secrets = new SecretsManager();
  
  // Retrive Configuration from Code Commit with specific commitId
  const configString = await loadAcceleratorConfig(configRepositoryName, configFilePath, configCommitId);
  const acceleratorConfig = AcceleratorConfig.fromString(configString);
  
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

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
      throw new Error(`Cannot find madOutput with vpc name ${madConfig['vpc-name']}`);
    }

    const directoryId = madOutput.directoryId;

    const accountId = getAccountId(accounts, accountKey);
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const directoryService = new DirectoryService(credentials);
    const hasLogGroup = await directoryService.hasLogGroup({ DirectoryId: directoryId });

    if (!hasLogGroup) {
      await directoryService.enableCloudWatchLogs({
        DirectoryId: directoryId,
        LogGroupName: `/aws/directoryservice/${madConfig['log-group-name']}`,
      });
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
      throw new Error(`Cannot find Owner account config with key ${ownerAccountKey}`);
    }

    const madDirId = ownerAccountConfig[1].deployments?.mad?.['dir-id'];
    if (!madDirId) {
      throw new Error(`Cannot find dir-id for Owner account with key ${ownerAccountKey}`);
    }

    const madOutputs: MadOutput[] = getStackJsonOutput(outputs, {
      accountKey: ownerAccountKey,
      outputType: 'MadOutput',
    });

    const madOutput = madOutputs.find(output => output.id === madDirId);
    if (!madOutput || !madOutput.directoryId) {
      throw new Error(`Cannot find madOutput with dir-id ${madDirId}`);
    }

    const directoryId = madOutput.directoryId;
    let sharedAccountId;
    const ownerAccountId = getAccountId(accounts, ownerAccountKey);
    try {
      sharedAccountId = getAccountId(accounts, accountKey);
    } catch (e) {
      console.warn(`Cannot find account with key ${accountKey}`);
    }

    await shareDirectory(ownerAccountId, directoryId, sharedAccountId);
  }
};
