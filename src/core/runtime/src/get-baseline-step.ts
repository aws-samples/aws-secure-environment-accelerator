import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';

export interface GetBaseLineInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  outputsTableName: string;
  acceleratorVersion?: string;
}

export interface ConfigurationOrganizationalUnit {
  ouId: string;
  ouKey: string;
  ouName: string;
}

export interface GetBaseelineOutput {
  baseline: string;
  storeAllOutputs: boolean;
  phases: number[];
}

const dynamoDB = new DynamoDB();

export const handler = async (input: GetBaseLineInput): Promise<GetBaseelineOutput> => {
  console.log(`Loading configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const { configFilePath, configRepositoryName, configCommitId, outputsTableName } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const globalOptionsConfig = config['global-options'];
  let baseline: string = 'LANDING_ZONE';
  if (!globalOptionsConfig['alz-baseline'] && !globalOptionsConfig['ct-baseline']) {
    baseline = 'ORGANIZATIONS';
  } else if (globalOptionsConfig['alz-baseline'] && !globalOptionsConfig['ct-baseline']) {
    baseline = 'LANDING_ZONE';
  } else if (!globalOptionsConfig['alz-baseline'] && globalOptionsConfig['ct-baseline']) {
    baseline = 'CONTROL_TOWER';
  } else {
    throw new Error(`Both "alz-baseline" and "ct-baseline" can't be true`);
  }

  return {
    baseline,
    storeAllOutputs: await dynamoDB.isEmpty(outputsTableName),
    phases: [-1, 0, 1, 2, 3, 4, 5],
  };
};
