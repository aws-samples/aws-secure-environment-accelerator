import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { AcceleratorConfig } from '.';

/**
 * Retrieve the configuration from CodeCommit.
 */
export async function loadAcceleratorConfig(props: {
  repositoryName: string;
  filePath: string;
  commitId: string;
  defaultRegion?: string;
}): Promise<AcceleratorConfig> {
  const { repositoryName, filePath, commitId, defaultRegion } = props;
  const codecommit = new CodeCommit(undefined, defaultRegion);
  try {
    const file = await codecommit.getFile(repositoryName, filePath, commitId);
    const source = file.fileContent.toString();
    return AcceleratorConfig.fromString(source);
  } catch (e) {
    throw new Error(`Unable to load configuration file "${filePath}" in Repository ${repositoryName}\n${e.message} code:${e.code}`);
  }
}
