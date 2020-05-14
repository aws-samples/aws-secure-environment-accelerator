import { CodeCommit } from '../aws/codecommit';
import { Base64 } from 'js-base64';

// Retriving Config from code commit with specific commitId
export async function loadAcceleratorConfig(
  repositoryName: string,
  filePath: string,
  commitId: string,
): Promise<string> {
  const codecommit = new CodeCommit();
  try {
    const source = await codecommit.getFile(repositoryName, filePath, commitId);
    return Base64.decode(source.fileContent.toString('base64'));
  } catch (e) {
    throw new Error(`Cannot find file with name "${filePath}" in Repository ${repositoryName} \n ${e.message}`);
  }
}
