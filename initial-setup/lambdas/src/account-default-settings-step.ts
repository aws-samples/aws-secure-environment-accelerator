import * as aws from 'aws-sdk';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { S3Control } from '@aws-pbmm/common-lambda/lib/aws/s3-control';
import { PutPublicAccessBlockRequest } from 'aws-sdk/clients/s3control';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { Account } from './load-accounts-step';
import { EC2 } from '@aws-pbmm/common-lambda/lib/aws/ec2';
import { loadStackOutputs } from '../../templates/src/utils/outputs';
import { getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION } from '../../templates/src/apps/phase-2';

interface AccountDefaultSettingsInput {
  assumeRoleName: string;
  configSecretSourceId: string;
  accounts: Account[];
  acceleratorName: string;
}

export const handler = async (input: AccountDefaultSettingsInput) => {
  console.log('Setting account level defaults for all accounts in an organization ...');
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName, configSecretSourceId, accounts, acceleratorName } = input;

  const outputs = await loadStackOutputs();

  const secrets = new SecretsManager();
  const source = await secrets.getSecret(configSecretSourceId);

  // load the configuration from Secrets Manager
  const configString = source.SecretString!;
  const config = AcceleratorConfig.fromString(configString);

  const sts = new STS();

  // TODO Cache the account credentials in the STS class to improve reusability
  const accountCredentials: { [accountId: string]: aws.Credentials } = {};
  const getAccountCredentials = async (accountId: string): Promise<aws.Credentials> => {
    if (accountCredentials[accountId]) {
      return accountCredentials[accountId];
    }
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    accountCredentials[accountId] = credentials;
    return credentials;
  };

  const putPublicAccessBlock = async (accountId: string, blockPublicAccess: boolean): Promise<void> => {
    const credentials = await getAccountCredentials(accountId);
    const s3control = new S3Control(credentials);
    const putPublicAccessBlockRequest: PutPublicAccessBlockRequest = {
      AccountId: accountId,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: blockPublicAccess,
        BlockPublicPolicy: blockPublicAccess,
        IgnorePublicAcls: blockPublicAccess,
        RestrictPublicBuckets: blockPublicAccess,
      },
    };
    await s3control.putPublicAccessBlock(putPublicAccessBlockRequest);
  };

  const enableEbsDefaultEncryption = async (accountId: string, accountKey: string): Promise<void> => {
    const credentials = await getAccountCredentials(accountId);

    const kmsKeyId = getStackOutput(outputs, accountKey, OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION);
    console.log('kmsKeyId: ' + kmsKeyId);

    const ec2 = new EC2(credentials);
    const enableEbsEncryptionByDefaultResult = await ec2.enableEbsEncryptionByDefault(false);
    console.log('enableEbsEncryptionByDefaultResult: ', enableEbsEncryptionByDefaultResult);

    const modifyEbsDefaultKmsKeyIdResult = await ec2.modifyEbsDefaultKmsKeyId(kmsKeyId, false);
    console.log('modifyEbsDefaultKmsKeyIdResult: ', modifyEbsDefaultKmsKeyIdResult);
  };

  const mandatoryAccountConfigs = config['mandatory-account-configs'];
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfigs)) {
    const account = accounts.find(a => a.key === accountKey);
    if (!account) {
      throw new Error(`Cannot find account with key "${accountKey}"`);
    }

    // if flag is undefined or false, turn ON s3 block public access
    const blockPublicAccess = !accountConfig['enable-s3-public-access'];
    await putPublicAccessBlock(account.id, blockPublicAccess);
    console.log(`Block S3 public access turned ON for account - ${accountKey}`);

    await enableEbsDefaultEncryption(account.id, account.key);
    console.log(`EBS default encryption turned ON with KMS CMK for account - ${accountKey}`);
  }

  return {
    status: 'SUCCESS',
    statusReason: 'Successfully defaults set at account level for all accounts in an organization.',
  };
};
