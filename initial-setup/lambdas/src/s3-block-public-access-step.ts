import * as aws from 'aws-sdk';
import { S3Control } from '@aws-pbmm/common-lambda/lib/aws/s3-control';
import { PutPublicAccessBlockRequest } from 'aws-sdk/clients/s3control';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';

interface S3BlockPublicAccessInput {
  assumeRoleName: string;
}

export const handler = async (input: S3BlockPublicAccessInput) => {
  console.log('Turning ON S3 Block Public Access at account level for all accounts in an organization ...');
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName } = input;

  const organizations = new Organizations();
  const sts = new STS();

  const organizationAccounts = await organizations.listAccounts();

  const accountCredentials: { [accountId: string]: aws.Credentials } = {};
  const getAccountCredentials = async (accountId: string): Promise<aws.Credentials> => {
    if (accountCredentials[accountId]) {
      return accountCredentials[accountId];
    }
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    accountCredentials[accountId] = credentials;
    return credentials;
  };

  for (const accounts of organizationAccounts) {
    const accountId = accounts.Id;
    const credentials = await getAccountCredentials(accountId!);

    const s3control = new S3Control(credentials);

    const input: PutPublicAccessBlockRequest = {
      AccountId: accountId!,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    };

    // TODO check the flag before the call; flag yet to be added in config file
    await s3control.getPublicAccessBlock(input);
  }

  return {
    status: 'SUCCESS',
    statusReason: 'Successfully turned ON S3 Block Public Access at account level for all accounts.',
  };
};
