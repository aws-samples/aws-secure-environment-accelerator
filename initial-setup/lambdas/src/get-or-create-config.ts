import { CodeCommit } from '@aws-pbmm/common-lambda/lib/aws/codecommit';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { RawConfig } from '@aws-pbmm/common-lambda/lib/util/common';
import { JSON_FORMAT, RAW_CONFIG_FILE, YAML_FORMAT } from '@aws-pbmm/common-lambda/lib/util/constants';

interface GetOrCreateConfigInput {
  repositoryName: string;
  filePath: string;
  s3Bucket: string;
  s3FileName: string;
  branchName: string;
  acceleratorVersion?: string;
}

const codecommit = new CodeCommit();

export const handler = async (input: GetOrCreateConfigInput) => {
  console.log(`Get or Create Config from S3 file...`);
  console.log(JSON.stringify(input, null, 2));

  const { repositoryName, filePath, s3Bucket, s3FileName, branchName, acceleratorVersion } = input;
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
    const extension = filePath.split('.').slice(-1)[0];
    const format = extension === JSON_FORMAT ? JSON_FORMAT : YAML_FORMAT;
    const rawConfigObject = new RawConfig({
      branchName,
      configFilePath: filePath,
      format,
      repositoryName,
      source: 'codecommit',
      s3Bucket,
    });

    const rawConfig = await rawConfigObject.prepare();

    let configCommitId;
    try {
      configCommitId = await codecommit.commit({
        branchName,
        repositoryName,
        putFiles: rawConfig.loadFiles,
        commitMessage: `Updating Raw Config in SM`,
        parentCommitId: configFile.commitId,
      });
    } catch (error) {
      if (error.code === 'NoChangeException') {
        console.log(`No Change in Configuration form Previous Execution`);
      } else {
        throw new Error(error);
      }
    }
    return {
      configRepositoryName: repositoryName,
      configFilePath: RAW_CONFIG_FILE,
      configCommitId: configCommitId || configFile.commitId,
      acceleratorVersion,
      configRootFilePath: filePath,
    };
  } catch (e) {
    if (e.code !== 'FileDoesNotExistException' && e.code !== 'CommitDoesNotExistException') {
      throw new Error(e);
    }

    // Retrieve file from S3 and push to Code Commit Config Repo
    console.log(`No config found in branch "${branchName}", creating one`);

    const extension = s3FileName.split('.').slice(-1)[0];
    const format = extension === JSON_FORMAT ? JSON_FORMAT : YAML_FORMAT;
    const rawConfigObject = new RawConfig({
      branchName,
      configFilePath: s3FileName,
      format,
      repositoryName,
      source: 's3',
      s3Bucket,
    });

    const rawConfig = await rawConfigObject.prepare();

    const configCommitId = await codecommit.commit({
      branchName,
      repositoryName,
      putFiles: rawConfig.loadFiles,
      commitMessage: `Initial push through SM from S3 to CodeCommit`,
    });

    console.log(
      JSON.stringify(
        {
          configRepositoryName: repositoryName,
          configFilePath: RAW_CONFIG_FILE,
          configCommitId,
          acceleratorVersion,
          configRootFilePath: filePath,
        },
        null,
        2,
      ),
    );
    return {
      configRepositoryName: repositoryName,
      configFilePath: RAW_CONFIG_FILE,
      configCommitId,
      acceleratorVersion,
      configRootFilePath: filePath,
    };
  }
};
