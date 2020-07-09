import { arrayEqual } from '@aws-pbmm/common-lambda/lib/util/arrays';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';

export interface LoadConfigurationInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
}

export interface LoadConfigurationOutput {
  configCommitId: string;
  baseline: string;
}

export interface ConfigurationOrganizationalUnit {
  ouId: string;
  ouKey: string;
  ouName: string;
}

export const handler = async (input: LoadConfigurationInput): Promise<LoadConfigurationOutput> => {
  console.log(`Loading configuration...`);
  console.log(JSON.stringify(input, null, 2));

  const { configFilePath, configRepositoryName, configCommitId } = input;

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
    ...input,
    baseline,
  };
};
