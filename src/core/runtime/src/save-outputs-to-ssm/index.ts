import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from '../load-configuration-step';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { saveNetworkOutputs } from './network-outputs';

export interface SaveOutputsToSsmInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  account: Account;
  region: string;
  outputsTableName: string;
}

const dynamodb = new DynamoDB();

export const handler = async (input: SaveOutputsToSsmInput) => {
  console.log(`Adding service control policy to organization...`);
  console.log(JSON.stringify(input, null, 2));

  const { acceleratorPrefix, configRepositoryName, configFilePath, configCommitId, outputsTableName, account } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  // Store Network Outputs to SSM Parameter Store
  await saveNetworkOutputs(outputsTableName, dynamodb, config, account);

  return {
    status: 'SUCCESS',
  };
};

handler({
  "acceleratorPrefix": "PBMMAccel-",
  "outputsTableName": "PBMMAccel-Outputs",
  "region": "eu-west-2",
  "account": {
      "arn": "arn:aws:organizations::538235518685:account/o-wdw2wt4bk9/233932606131",
      "email": "nkoppula+non-alz-5-security@amazon.com",
      "id": "233932606131",
      "key": "security",
      "name": "security",
      "ou": "corerename",
      "ouPath": "corerename"
  },
  configCommitId: 'master',
  configFilePath: 'raw/config.json',
  configRepositoryName: 'PBMMAccel-Config-Repo'
});
