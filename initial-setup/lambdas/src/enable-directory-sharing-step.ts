import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getAccountId } from '../../templates/src/utils/accounts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

interface ShareDirectoryInput {
  accounts: Account[];
  stackOutputSecretId: string;
  assumeRoleName: string;
  configSecretSourceId: string;
}

export const handler = async (input: ShareDirectoryInput) => {
  console.log(`Sharing MAD  to Master account ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts, assumeRoleName, stackOutputSecretId, configSecretSourceId: configSecretId } = input;

  const secrets = new SecretsManager();
  const configString = await secrets.getSecret(configSecretId);
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  const acceleratorConfig = AcceleratorConfig.fromString(configString.SecretString!);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const sts = new STS();
  const masterAccountId = getAccountId(accounts, 'master'); // TODO get it dynamically

  for (const mandatoryConfig of Object.values(acceleratorConfig['mandatory-account-configs'])) {
    const madConfig = mandatoryConfig.deployments?.mad;
    if (madConfig && madConfig.deploy) {
      const directoryId = getStackOutput(
        outputs,
        mandatoryConfig['account-name'],
        `Mad${madConfig['vpc-name']}Subnet${madConfig.subnet}Id`,
      );

      const accountId = getAccountId(accounts, mandatoryConfig['account-name']);
      const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
      const directoryService = new DirectoryService(credentials);
      const hasLogGroup = await directoryService.hasLogGroup({ DirectoryId: directoryId });

      if (!hasLogGroup) {
        await directoryService.enableCloudWatchLogs({
          DirectoryId: directoryId,
          LogGroupName: `/aws/directoryservice/${madConfig['log-group-name']}`,
        });
      }

      if (madConfig['share-to-master']) {
        const sharedAccounts = await directoryService.describeSharedDirectories({ OwnerDirectoryId: directoryId });

        if (!sharedAccounts.includes(masterAccountId)) {
          const sharedDirectoryId = await directoryService.shareDirectory({
            DirectoryId: directoryId,
            ShareMethod: 'HANDSHAKE', // Sharing outside of an organization use ORGANIZATIONS
            ShareTarget: {
              Id: masterAccountId,
              Type: 'ACCOUNT',
            },
          });

          if (sharedDirectoryId) {
            console.log('Accepting the request from master account');
            const masterCredentials = await sts.getCredentialsForAccountAndRole(masterAccountId, assumeRoleName);
            const masterDirectoryService = new DirectoryService(masterCredentials);
            await masterDirectoryService.acceptDirectory({
              SharedDirectoryId: sharedDirectoryId,
            });
          }
        }
      }
    }
  }
};
