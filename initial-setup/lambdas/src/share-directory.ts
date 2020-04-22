import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getAccountId } from '../../templates/src/utils/accounts';

interface ShareDirectoryInput {
  accounts: Account[];
  assumeRoleName: string;
}

export const handler = async (input: ShareDirectoryInput) => {
  console.log(`Sharing MAD  to Master account ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts, assumeRoleName } = input;

  const masterAccountId = getAccountId(accounts, 'master');
  const accountId = getAccountId(accounts, 'operations');

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);

  const directoryService = new DirectoryService(credentials);

  await directoryService.enableCloudWatchLogs({
    DirectoryId: '', // TODO get id
    LogGroupName: '', // TODO get group name
  });

  // if (shareToMaster) {
  if (true) {
    await directoryService.shareDirectory({
      DirectoryId: '',
      ShareMethod: '',
      ShareTarget: {
        Id: '',
        Type: '',
      },
    });

    const masterCredentials = await sts.getCredentialsForAccountAndRole(masterAccountId, assumeRoleName);
    const masterDirectoryService = new DirectoryService(masterCredentials);
    await masterDirectoryService.acceptDirectory({
      SharedDirectoryId: '',
    });
  }
};
