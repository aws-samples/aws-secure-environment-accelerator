import * as aws from 'aws-sdk';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { S3Control } from '@aws-pbmm/common-lambda/lib/aws/s3-control';
import { PutPublicAccessBlockRequest } from 'aws-sdk/clients/s3control';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { Account } from './load-accounts-step';

interface S3BlockPublicAccessInput {
  assumeRoleName: string;
  configSecretSourceId: string;
  accounts: Account[];
}

export const handler = async (input: S3BlockPublicAccessInput) => {
  console.log('Turning ON S3 Block Public Access at account level for all accounts in an organization ...');
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName, configSecretSourceId, accounts } = input;

  const secrets = new SecretsManager();
  const source = await secrets.getSecret(configSecretSourceId);

  // load the configuration from Secrets Manager
  const configString = source.SecretString!;
  const config = AcceleratorConfig.fromString(configString);

  const sts = new STS();

  const accountCredentials: { [accountId: string]: aws.Credentials } = {};

  const getAccountCredentials = async (accountId: string): Promise<aws.Credentials> => {
    if (accountCredentials[accountId]) {
      return accountCredentials[accountId];
    }
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    accountCredentials[accountId] = credentials;
    return credentials;
  };

  const s3BlockPublicAccess = async (accountId: string): Promise<void> => {
    const credentials = await getAccountCredentials(accountId);
    const s3control = new S3Control(credentials);
    const putPublicAccessBlockRequest: PutPublicAccessBlockRequest = {
      AccountId: accountId,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    };
    await s3control.putPublicAccessBlock(putPublicAccessBlockRequest);
  };

  const mandatoryAccountConfigs = config['mandatory-account-configs'];

  // for all mandatory accounts
  for (const mandatoryAccountConfig of Object.values(mandatoryAccountConfigs)) {
    const accountName = mandatoryAccountConfig['account-name'];
    const account = accounts.find(a => a.name === accountName);
    const accountId = account?.id;

    // if flag is undefined or false, turn ON s3 block public access
    if (!mandatoryAccountConfig['enable-s3-public-access']) {
      await s3BlockPublicAccess(accountId!);
    }
  }

  return {
    status: 'SUCCESS',
    statusReason: 'Successfully turned ON S3 Block Public Access at account level for all accounts.',
  };
};
