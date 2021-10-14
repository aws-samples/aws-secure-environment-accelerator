import { LoadConfigurationInput } from './load-configuration-step';
import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { loadAccounts } from './utils/load-accounts';

export interface LoadConsolidatedInput extends LoadConfigurationInput {
  accountsTableName?: string;
  s3WorkingBucket?: string;
}

export interface LoadConsolidatedResult {
  bucket?: string;
  configKey?: string;
  accountsKey?: string;
}

const dynamodb = new DynamoDB();
const s3 = new S3();

export const handler = async (input: LoadConsolidatedInput) => {
  console.log(`Loading Configuration Info...`);
  console.log(JSON.stringify(input, null, 2));

  const { configCommitId, configFilePath, configRepositoryName, accountsTableName, s3WorkingBucket } = input;

  const result: LoadConsolidatedResult = {};

  if (s3WorkingBucket) {
    result.bucket = s3WorkingBucket;
    const path = `${configCommitId}`;

    const codecommit = new CodeCommit(undefined, undefined);
    try {
      const file = await codecommit.getFile(configRepositoryName, configFilePath, configCommitId);
      const source = file.fileContent.toString();

      const key = `${path}/config.json`;
      const fileUploadResult = await s3.putObject({
        Body: source,
        Key: key,
        Bucket: s3WorkingBucket,
      });
      console.log(JSON.stringify(fileUploadResult));
      result.configKey = key;
    } catch (e) {
      throw new Error(
        `Unable to load configuration file "${configFilePath}" in Repository ${configRepositoryName}\n${e.message} code:${e.code}`,
      );
    }

    if (accountsTableName) {
      try {
        const accounts = await loadAccounts(accountsTableName, dynamodb);

        const key = `${path}/accounts.json`;
        const fileUploadResult = await s3.putObject({
          Body: JSON.stringify(accounts),
          Key: key,
          Bucket: s3WorkingBucket,
        });
        console.log(JSON.stringify(fileUploadResult));
        result.accountsKey = key;
      } catch (e) {
        throw new Error(`Unable to load accounts\n${e.message} code:${e.code}`);
      }
    }
  }

  console.log(`Result: ${JSON.stringify(result)}`);
  return result;
};
