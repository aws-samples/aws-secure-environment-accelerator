import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { loadAcceleratorConfigWithS3Attempt } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from './load-configuration-step';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';
import { MandatoryAccountType } from '@aws-accelerator/common-config';
import { loadAccountsWithS3Attempt } from './utils/load-accounts';
import { LoadConsolidatedResult } from './load-consolidated';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src/index';

export interface GetAccountInfoInput extends LoadConfigurationInput {
  accountId?: string;
  accountType?: MandatoryAccountType;
  accountsTableName?: string;
  configDetails?: LoadConsolidatedResult;
}

const organizations = new Organizations();
const dynamodb = new DynamoDB();

export const handler = async (input: GetAccountInfoInput) => {
  console.log(`Get Account Info...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    accountId,
    configCommitId,
    configFilePath,
    configRepositoryName,
    accountType,
    accountsTableName,
    configDetails,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfigWithS3Attempt({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
    s3BucketName: configDetails?.bucket,
    s3KeyName: configDetails?.configKey,
  });
  if (accountType) {
    const mandatoryAccountKey = acceleratorConfig.getMandatoryAccountKey(accountType);
    const accounts = await loadAccountsWithS3Attempt(
      accountsTableName!,
      dynamodb,
      configDetails?.bucket,
      configDetails?.accountsKey,
    );
    const mandatoryAccount = accounts.find(acc => acc.key === mandatoryAccountKey);
    const rootOrg = await organizations.describeOrganization();
    if (!mandatoryAccount) {
      throw new Error(`${accountType} account not found`);
    }
    // Setting Root Organization if in "OU"
    mandatoryAccount.ou = rootOrg?.Id!;
    return mandatoryAccount;
  }
  const awsAccount = await organizations.getAccount(accountId!);
  if (!awsAccount) {
    throw new Error(`Unable retrive account from Organizations api for "${accountId}"`);
  }
  const configAccount = acceleratorConfig
    .getAccountConfigs()
    .find(([_, accountConfig]) => equalIgnoreCase(accountConfig.email, awsAccount.Email!));
  if (!configAccount) {
    throw new Error(`Account didn't find in Configuration "${accountId}" with email ${awsAccount.Email}`);
  }
  const accountKey = configAccount?.[0];
  const ou = configAccount?.[1].ou;
  const ouPath = configAccount?.[1]['ou-path'];
  const account: Account = {
    arn: awsAccount.Arn!,
    email: awsAccount.Email!,
    id: accountId!,
    key: accountKey,
    name: awsAccount.Name!,
    ou,
    ouPath,
  };
  return account;
};
