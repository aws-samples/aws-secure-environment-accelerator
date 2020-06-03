import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';

interface GetOrCreateConfigInput {
  repositoryName: string;
  filePath: string;
  s3Bucket: string;
  s3FileName: string;
  branchName: string;
}

const codecommit = new CodeCommit();

export const handler = async (input: GetOrCreateConfigInput) => {
  console.log(`Get or Create Config from S3 file...`);
  console.log(JSON.stringify(input, null, 2));

  const { repositoryName, filePath, s3Bucket, s3FileName, branchName } = input;
  const configRepository = await codecommit.batchGetRepositories([repositoryName]);
  if (!configRepository.repositories || configRepository.repositories?.length === 0) {
    console.log(`Creating repository "${repositoryName}" for Config file`);
    await codecommit.createRepository(repositoryName, 'This repository contains configuration');
    console.log(`Creation of repository "${repositoryName}" is done for Config file`);
  }

  console.log(`Retrieving config file from config Repo`);
  try {
    // TODO Get previous commit in order to compare config files
    console.log(`Trying to retrieve existing config from branch "${branchName}"`);
    const configFile = await codecommit.getFile(repositoryName, filePath, branchName);
    return {
      configRepositoryName: repositoryName,
      configFilePath: filePath,
      configCommitId: configFile.commitId,
    };
  } catch (e) {
    if (e.code !== 'FileDoesNotExistException' && e.code !== 'CommitDoesNotExistException') {
      throw new Error(e);
    }

    // Retrieve file from S3 and push to Code Commit Config Repo
    console.log(`No config found in branch "${branchName}", creating one`);
    const s3 = new S3();
    const configString = await s3.getObjectBodyAsString({
      Bucket: s3Bucket,
      Key: s3FileName,
    });

    // Push config file to repository
    const commit = await codecommit.putFile({
      branchName,
      repositoryName,
      filePath,
      fileContent: configString,
      commitMessage: `Initial configuration file copied from s3://${s3Bucket}/${s3FileName}`,
    });
    console.log(`CommitID for config file is "${commit.commitId}"`);

    // Remove the S3 config object
    await s3.deleteObject({
      Bucket: s3Bucket,
      Key: s3FileName,
    });

    return {
      configRepositoryName: repositoryName,
      configFilePath: filePath,
      configCommitId: commit.commitId,
    };
  }
};
