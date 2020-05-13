import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';

interface GetOrCreateConfigInput {
  repositoryName: string;
  filePath: string;
  s3Bucket: string;
  s3FileName: string;
  branchName: string;
}

export const handler = async (input: GetOrCreateConfigInput) => {
  console.log(`Get or Create Config from S3 file...`);
  console.log(JSON.stringify(input, null, 2));
  const { repositoryName, filePath, s3Bucket, s3FileName, branchName } = input;
  const codecommit = new CodeCommit();
  const repos = await codecommit.batchGetRepositories([repositoryName]);
  let commitId: string = '';
  if (!repos.repositories || repos.repositories?.length === 0) {
    console.log(`Creating repository "${repositoryName}" for Config file`);
    await codecommit.createRepository(repositoryName);
    console.log(`Creation of repository "${repositoryName}" is done for Config file`);
  }
  console.log(`Retriving Config file from config Repo`);
  try {
    const configFile = await codecommit.getFile(repositoryName, filePath, branchName);
    commitId = configFile.commitId;
  } catch (e) {
    if (e.code === 'FileDoesNotExistException' || e.code === 'CommitDoesNotExistException') {
      // Retrive file from S3 and push to Code Commit Config Repo
      const s3 = new S3();
      const configString = await s3.getObjectBodyAsString({
        Bucket: s3Bucket,
        Key: s3FileName
      });
      // Push config file to repository
      const commit = await codecommit.putFile({
        branchName: branchName,
        repositoryName,
        filePath,
        fileContent: configString,
        commitMessage: 'Config push'
      });
      commitId = commit.commitId;
    } else {
      throw new Error(e);
    }
  }
  console.log(`CommitID for config file is "${commitId}"`);
  return {
    configRepositoryName: repositoryName,
    configFilePath: filePath,
    configCommitId: commitId,
  };
};