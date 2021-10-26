import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';

export interface GetBaseLineInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  outputTableName: string;
  acceleratorVersion?: string;
  storeAllOutputs?: boolean;
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
  organizationAdminRole: string;
}

const dynamoDB = new DynamoDB();

export const handler = async (input: GetBaseLineInput): Promise<GetBaseelineOutput> => {
  console.log(`Loading configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const { configFilePath, configRepositoryName, configCommitId, outputTableName, storeAllOutputs } = input;

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

  let runStoreAllOutputs: boolean = !!storeAllOutputs;
  if (!runStoreAllOutputs) {
    // Checking whether DynamoDB outputs table is empty or not
    runStoreAllOutputs = await dynamoDB.isEmpty(outputTableName);
  }
  console.log(
    JSON.stringify(
      {
        baseline,
        storeAllOutputs: runStoreAllOutputs,
        phases: [-1, 0, 1, 2, 3],
      },
      null,
      2,
    ),
  );
  return {
    baseline,
    storeAllOutputs: runStoreAllOutputs,
    phases: [-1, 0, 1, 2, 3],
    organizationAdminRole: globalOptionsConfig['organization-admin-role'] || 'AWSCloudFormationStackSetExecutionRole',
  };
};
