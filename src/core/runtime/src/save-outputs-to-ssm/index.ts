import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from '../load-configuration-step';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { saveNetworkOutputs } from './network-outputs';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';

export interface SaveOutputsToSsmInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  account: Account;
  region: string;
  outputsTableName: string;
  assumeRoleName: string;
}

const dynamodb = new DynamoDB();
const sts = new STS();

export const handler = async (input: SaveOutputsToSsmInput) => {
  console.log(`Adding service control policy to organization...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    configRepositoryName,
    configFilePath,
    configCommitId,
    outputsTableName,
    account,
    assumeRoleName,
    region,
  } = input;
  // Remove - if prefix ends with -
  const acceleratorPrefix = input.acceleratorPrefix.endsWith('-')
    ? input.acceleratorPrefix.slice(0, -1)
    : input.acceleratorPrefix;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const credentials = await sts.getCredentialsForAccountAndRole(account.id, assumeRoleName);
  const ssm = new SSM(credentials, region);
  // Store Network Outputs to SSM Parameter Store
  await saveNetworkOutputs({
    acceleratorPrefix,
    config,
    dynamodb,
    outputsTableName,
    ssm,
    account,
    region,
  });

  return {
    status: 'SUCCESS',
  };
};
