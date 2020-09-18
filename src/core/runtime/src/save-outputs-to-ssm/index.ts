import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from '../load-configuration-step';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export interface SaveOutputsToSsmInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  account: Account;
  region: string;
  outputTableName: string;
  outputType: string;
}

const dynamodb = new DynamoDB();

export const handler = async (input: SaveOutputsToSsmInput) => {
  console.log(`Adding service control policy to organization...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, configRepositoryName, configFilePath, configCommitId, outputTableName } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  return {
    status: 'SUCCESS',
  };
};
