import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import * as fs from 'fs';
import * as path from 'path';
import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { Base64 } from 'js-base64';

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
  if (!configFilePath && configRepositoryName) {
    throw new Error(`The environment variables "CONFIG_FILE_NAME" and "CONFIG_REPOSITORY_NAME" needs to be set`);
  }

  const codecommit = new CodeCommit();
  let configString;
  try {
    const source = await codecommit.getFile(configRepositoryName, configFilePath);
    configString = Base64.decode(source.fileContent.toString('base64'));
  } catch (e) {
    throw new Error(
      `Cannot find file with name "${configFilePath}" in Repository ${configRepositoryName} \n ${e.message}`,
    );
  }

  return AcceleratorConfig.fromString(configString);
}
