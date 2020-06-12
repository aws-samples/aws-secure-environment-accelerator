import { CodeCommit } from '../aws/codecommit';
import { AcceleratorConfig } from '.';
import { compareConfiguration } from '../aws/config-diff';

/**
 * Retrieve and compare previous and the current configuration from CodeCommit
 */
export async function compareAcceleratorConfig(props: {
  repositoryName: string;
  filePath: string;
  commitId: string;
  previousCommitId: string;
}): Promise<AcceleratorConfig> {
  const { repositoryName, filePath, commitId, previousCommitId } = props;
  const codecommit = new CodeCommit();
  try {
    console.log('started comparison');
    console.log('getting previous file');
    const previousFile = await codecommit.getFile(repositoryName, filePath, previousCommitId);
    console.log('reading previous file');
    const original = previousFile.fileContent.toString();
    console.log('preparing previous file object');
    const originalConfig = AcceleratorConfig.fromString(original);

    console.log('getting modified file');
    const file = await codecommit.getFile(repositoryName, filePath, commitId);
    const modified = file.fileContent.toString();
    const modifiedConfig = AcceleratorConfig.fromString(modified);

    // TODO compare both the configurations
    const differences = compareConfiguration(originalConfig, modifiedConfig);
    console.log(differences);

    return AcceleratorConfig.fromString(modified);
  } catch (e) {
    throw new Error(`Unable to load configuration file "${filePath}" in Repository ${repositoryName}\n${e.message}`);
  }
}

// compareAcceleratorConfig({
//   repositoryName: 'PBMMAccel-Config-Repo',
//   filePath: 'config.json',
//   commitId: '6707bae30a71f82f987b9680ed662681bc5ccbdb',
//   previousCommitId: '28fc52cfdc37e426e96d4ae95f2b00444d2f1fca',
// });
