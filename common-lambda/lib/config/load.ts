import { CodeCommit } from '../aws/codecommit';
import { AcceleratorConfig } from '.';

/**
 * Retrieve the configuration from CodeCommit.
 */
export async function loadAcceleratorConfig(props: {
  repositoryName: string;
  filePath: string;
  commitId: string;
}): Promise<AcceleratorConfig> {
  const { repositoryName, filePath, commitId } = props;
  const codecommit = new CodeCommit();
  try {
    const file = await codecommit.getFile(repositoryName, filePath, commitId);
    const source = file.fileContent.toString();
    return AcceleratorConfig.fromString(source);
  } catch (e) {
    throw new Error(`Unable to load configuration file "${filePath}" in Repository ${repositoryName}\n${e.message}`);
  }
}
