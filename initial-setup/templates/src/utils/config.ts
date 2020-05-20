import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import * as fs from 'fs';
import * as path from 'path';
import { loadAcceleratorConfig as load } from '@aws-pbmm/common-lambda/lib/config/load';

export async function loadAcceleratorConfig(): Promise<AcceleratorConfig> {
  if (process.env.CONFIG_MODE === 'development') {
    const configPath = path.join(__dirname, '..', '..', 'config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Cannot find local config.json at "${configPath}"`);
    }
    const contents = fs.readFileSync(configPath);
    return AcceleratorConfig.fromBuffer(contents);
  }

  const configFilePath = process.env.CONFIG_FILE_PATH!;
  const configRepositoryName = process.env.CONFIG_REPOSITORY_NAME!;
  const configCommitId = process.env.CONFIG_COMMIT_ID!;
  if (!configFilePath || !configRepositoryName || !configCommitId) {
    throw new Error(
      `The environment variables "CONFIG_FILE_PATH" and "CONFIG_REPOSITORY_NAME" and "CONFIG_COMMIT_ID" need to be set`,
    );
  }
  // Retrieve Configuration from Code Commit with specific commitId
  return load({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
}
