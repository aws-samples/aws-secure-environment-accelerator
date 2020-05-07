import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getAccountId } from '../../templates/src/utils/accounts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

interface ShareDirectoryInput {
  accounts: Account[];
  stackOutputSecretId: string;
  assumeRoleName: string;
  configSecretSourceId: string;
}

interface MadOutput {
  id: number;
  vpcName: string;
  directoryId: string;
  dnsIps: string;
}

export const handler = async (input: ShareDirectoryInput) => {
  console.log(`Sharing MAD to another account ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts, assumeRoleName, stackOutputSecretId, configSecretSourceId: configSecretId } = input;

  const secrets = new SecretsManager();
  const configString = await secrets.getSecret(configSecretId);
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  const acceleratorConfig = AcceleratorConfig.fromString(configString.SecretString!);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const sts = new STS();

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

    const madOuput = madOutputs.find(output => output.id === madConfig['dir-id']);
    if (!madOuput || !madOuput.directoryId) {
      throw new Error(`Cannot find madOuput with vpc name ${madConfig['vpc-name']}`);
    }

    const directoryId = madOuput.directoryId;

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
      const sharedAccountId = getAccountId(accounts, madConfig['share-to-account']);
      const sharedAccounts = await directoryService.findSharedAccounts({ OwnerDirectoryId: directoryId });

      if (!sharedAccounts.includes(sharedAccountId)) {
        const sharedDirectoryId = await directoryService.shareDirectory({
          DirectoryId: directoryId,
          ShareMethod: 'HANDSHAKE', // Sharing outside of an organization use ORGANIZATIONS
          ShareTarget: {
            Id: sharedAccountId,
            Type: 'ACCOUNT',
          },
        });

        if (sharedDirectoryId) {
          console.log('Accepting the request from shared account');
          const sharedAccountCredentials = await sts.getCredentialsForAccountAndRole(sharedAccountId, assumeRoleName);
          const sharedAccountDirectoryService = new DirectoryService(sharedAccountCredentials);
          await sharedAccountDirectoryService.acceptDirectory({
            SharedDirectoryId: sharedDirectoryId,
          });
        }
      }
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
  for (const [ouKey, ou] of oUs) {
    const sharedMadOu = ou['share-mad-from'];
    if (!sharedMadOu) {
      continue;
    }
    const ouAccountConfigs = acceleratorConfig.getAccountConfigsForOu(ouKey);
    for (const accountKey of Object.keys(ouAccountConfigs)) {
      shareMadToAccounts.push({ accountKey, ownerAccountKey: sharedMadOu });
    }
  }

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

    const madOuput = madOutputs.find(output => output.id === madDirId);
    if (!madOuput || !madOuput.directoryId) {
      throw new Error(`Cannot find madOuput with dir-id ${madDirId}`);
    }

    const directoryId = madOuput.directoryId;
    const ownerAccountId = getAccountId(accounts, ownerAccountKey);
    const sharedAccountId = getAccountId(accounts, accountKey);
    const credentials = await sts.getCredentialsForAccountAndRole(ownerAccountId, assumeRoleName);
    const directoryService = new DirectoryService(credentials);

    const sharedAccounts = await directoryService.findSharedAccounts({ OwnerDirectoryId: directoryId });

    if (!sharedAccounts.includes(sharedAccountId)) {
      const sharedDirectoryId = await directoryService.shareDirectory({
        DirectoryId: directoryId,
        ShareMethod: 'HANDSHAKE', // Sharing outside of an organization use ORGANIZATIONS
        ShareTarget: {
          Id: sharedAccountId,
          Type: 'ACCOUNT',
        },
      });

      if (sharedDirectoryId) {
        const sharedAccountCredentials = await sts.getCredentialsForAccountAndRole(sharedAccountId, assumeRoleName);
        const sharedAccountDirectoryService = new DirectoryService(sharedAccountCredentials);
        await sharedAccountDirectoryService.acceptDirectory({
          SharedDirectoryId: sharedDirectoryId,
        });
      }
    }
  }
};
