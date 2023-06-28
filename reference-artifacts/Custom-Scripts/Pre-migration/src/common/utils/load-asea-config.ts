import { CodeCommit } from '../aws/codecommit';

export async function loadAseaConfig(repositoryName: string, region: string): Promise<string> {
  const codecommit = new CodeCommit(undefined, region);
  const configFileRepositoryParams = {
    repositoryName: repositoryName,
    // Reading Accelerator full configuration
    filePath: 'raw/config.json',
  };
  const configFileResponse = await codecommit.getFile(configFileRepositoryParams);

  const configFileContents = JSON.parse(configFileResponse.fileContent.toString());

  return configFileContents;
}
