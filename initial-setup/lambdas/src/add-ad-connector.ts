import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getAccountId } from '../../templates/src/utils/accounts';

interface AdConnectorInput {
  accounts: Account[];
  assumeRoleName: string;
}

export const handler = async (input: AdConnectorInput) => {
  console.log(`Creating AD Connector in Master account ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts, assumeRoleName } = input;

  const masterAccountId = getAccountId(accounts, 'master');

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(masterAccountId, assumeRoleName);

  const directoryService = new DirectoryService(credentials);

  await directoryService.createAdConnector({
    Name: '', // TODO get it from config file
    ShortName: '', // TODO get it from config file
    Password: '', // TODO get it from secrets manager
    Size: '', // TODO get it from config file
    ConnectSettings: {
      VpcId: '', // TODO get it from stacks output
      SubnetIds: [''], // TODO get it from stacks output
      CustomerDnsIps: [''], // TODO get it from stacks output
      CustomerUserName: 'admin', // TODO get it from config file
    },
  });
};
