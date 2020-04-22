import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getAccountId } from '../../templates/src/utils/accounts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { getStackOutput, StackOutputs } from '../../templates/src/utils/outputs';

interface ShareDirectoryInput {
  accounts: Account[];
  stackOutputSecretId: string;
  assumeRoleName: string;
  configSecretId: string;
}

export const handler = async (input: ShareDirectoryInput) => {
  console.log(`Sharing MAD  to Master account ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts, assumeRoleName, stackOutputSecretId, configSecretId } = input;

  const masterAccountId = getAccountId(accounts, 'master');

  const secrets = new SecretsManager();
  const configString = await secrets.getSecret(configSecretId);
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  const acceleratorConfig = AcceleratorConfig.fromString(configString.SecretString!);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutputs;

  const sts = new STS();

  for (const mandatoryConfig of Object.values(acceleratorConfig['mandatory-account-configs'])) {
    const madConfig = mandatoryConfig.deployments?.mad;
    if (madConfig && madConfig.deploy) {
      const directoryId = getStackOutput(
        outputs,
        mandatoryConfig['account-name'],
        `MAD${madConfig['vpc-name']}Subnet${madConfig.subnet}Id`,
      );

      const accountId = getAccountId(accounts, mandatoryConfig['account-name']);
      const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
      const directoryService = new DirectoryService(credentials);

      await directoryService.enableCloudWatchLogs({
        DirectoryId: directoryId,
        LogGroupName: 'PBMM-Active-Directory', // TODO get group name
      });

      if (madConfig['share-to-master']) {
        await directoryService.shareDirectory({
          DirectoryId: directoryId,
          ShareMethod: 'ORGANIZATIONS',
          ShareTarget: {
            Id: masterAccountId,
            Type: 'Account',
          },
        });

        const masterCredentials = await sts.getCredentialsForAccountAndRole(masterAccountId, assumeRoleName);
        const masterDirectoryService = new DirectoryService(masterCredentials);
        await masterDirectoryService.acceptDirectory({
          SharedDirectoryId: directoryId,
        });
      }
    }
  }
};
