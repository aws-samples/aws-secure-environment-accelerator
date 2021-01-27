import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { RawConfig } from '@aws-accelerator/common/src/util/common';
import { JSON_FORMAT, RAW_CONFIG_FILE, YAML_FORMAT } from '@aws-accelerator/common/src/util/constants';
import { StepFunctions } from '@aws-accelerator/common/src/aws/stepfunctions';

interface GetOrCreateConfigInput {
  repositoryName: string;
  s3Bucket: string;
  branchName: string;
  executionArn: string;
  stateMachineArn: string;
  acceleratorVersion?: string;
  // Taking entire input to replace any default paramaters in SM Input
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputConfig?: any;
}

const codecommit = new CodeCommit();
const s3 = new S3();
const stepfunctions = new StepFunctions();

export const handler = async (input: GetOrCreateConfigInput) => {
  console.log(`Get or Create Config from S3 file...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    repositoryName,
    s3Bucket,
    branchName,
    acceleratorVersion,
    inputConfig,
    executionArn,
    stateMachineArn,
  } = input;
  const runningStatus = await validateExecution(stateMachineArn, executionArn);
  if (runningStatus === 'DUPLICATE_EXECUTION') {
    throw new Error('Another execution of Accelerator is already running');
  }
  const storeAllOutputs: boolean = !!inputConfig.storeAllOutputs;
  const configRepository = await codecommit.batchGetRepositories([repositoryName]);
  if (!configRepository.repositories || configRepository.repositories?.length === 0) {
    console.log(`Creating repository "${repositoryName}" for Config file`);
    await codecommit.createRepository(repositoryName, 'This repository contains configuration');
    console.log(`Creation of repository "${repositoryName}" is done for Config file`);
  }

  console.log(`Retrieving config file from config Repo`);
  try {
    console.log(`Trying to retrieve existing config from branch "${branchName}"`);
    const yamlFileStatus = await isFileExist({
      source: 'codecommit',
      branchName,
      repositoryName,
      fileName: 'config.yaml',
    });
    const jsonFileStatus = await isFileExist({
      source: 'codecommit',
      branchName,
      repositoryName,
      fileName: 'config.json',
    });
    let filePath: string;
    if (yamlFileStatus) {
      filePath = 'config.yaml';
    } else if (jsonFileStatus) {
      filePath = 'config.json';
    } else {
      console.log(`Empty Repository exists, retriving config from S3Bucket: ${s3Bucket}`);
      // Load S3 Config
      const s3LoadResponse = await loadConfigFromS3({
        branchName,
        repositoryName,
        s3Bucket,
      });
      console.log(
        JSON.stringify(
          {
            ...s3LoadResponse,
            acceleratorVersion,
            storeAllOutputs,
          },
          null,
          2,
        ),
      );
      return {
        ...s3LoadResponse,
        acceleratorVersion,
        storeAllOutputs,
      };
    }
    const currentCommit = await codecommit.getBranch(repositoryName, branchName);
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

    let configCommitId: string = '';
    try {
      configCommitId = await codecommit.commit({
        branchName,
        repositoryName,
        putFiles: rawConfig.loadFiles,
        commitMessage: `Updating Raw Config in SM`,
        parentCommitId: currentCommit.branch?.commitId,
      });
    } catch (error) {
      if (error.code === 'NoChangeException') {
        console.log(`No Change in Configuration form Previous Execution`);
      } else {
        throw new Error(error);
      }
    }

    console.log(
      JSON.stringify(
        {
          configRepositoryName: repositoryName,
          configFilePath: RAW_CONFIG_FILE,
          configCommitId: configCommitId || currentCommit.branch?.commitId,
          acceleratorVersion,
          configRootFilePath: filePath,
          storeAllOutputs,
        },
        null,
        2,
      ),
    );

    return {
      configRepositoryName: repositoryName,
      configFilePath: RAW_CONFIG_FILE,
      configCommitId: configCommitId || currentCommit.branch?.commitId,
      acceleratorVersion,
      configRootFilePath: filePath,
      storeAllOutputs,
    };
  } catch (e) {
    if (e.code !== 'FileDoesNotExistException' && e.code !== 'CommitDoesNotExistException') {
      throw new Error(e);
    }
    const s3LoadResponse = await loadConfigFromS3({
      branchName,
      repositoryName,
      s3Bucket,
    });

    console.log(
      JSON.stringify(
        {
          ...s3LoadResponse,
          acceleratorVersion,
          storeAllOutputs,
        },
        null,
        2,
      ),
    );

    return {
      ...s3LoadResponse,
      acceleratorVersion,
      storeAllOutputs,
    };
  }
};

async function loadConfigFromS3(props: { branchName: string; repositoryName: string; s3Bucket: string }) {
  const { branchName, repositoryName, s3Bucket } = props;
  let s3FileName: string;
  const yamlFileStatus = await isFileExist({
    source: 's3',
    branchName,
    repositoryName,
    s3Bucket,
    fileName: 'config.yaml',
  });
  const jsonFileStatus = await isFileExist({
    source: 's3',
    branchName,
    repositoryName,
    s3Bucket,
    fileName: 'config.json',
  });
  if (yamlFileStatus && jsonFileStatus) {
    throw new Error(`Both "config.yaml" and "config.json" exists in S3Bucket: "${s3Bucket}"`);
  } else if (yamlFileStatus) {
    s3FileName = 'config.yaml';
  } else if (jsonFileStatus) {
    s3FileName = 'config.json';
  } else {
    throw new Error(
      `No Configuratin found in S3Bucket: "${s3Bucket}". Either "config.yaml" or "config.json" is required`,
    );
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

  // Delete Config from S3Bucket
  console.log(`Deleting configuration files from S3Bucket: ${s3Bucket}`);
  for (const configFile of rawConfig.loadFiles) {
    await s3.deleteObject({
      Bucket: s3Bucket,
      Key: configFile.filePath,
    });
  }
  return {
    configRepositoryName: repositoryName,
    configFilePath: RAW_CONFIG_FILE,
    configCommitId,
    configRootFilePath: s3FileName,
  };
}
async function isFileExist(props: {
  source: 's3' | 'codecommit';
  fileName: string;
  s3Bucket?: string;
  repositoryName?: string;
  branchName?: string;
}) {
  const { fileName, source, branchName, repositoryName, s3Bucket } = props;
  if (source === 's3') {
    try {
      await s3.getObjectBodyAsString({
        Bucket: s3Bucket!,
        Key: fileName,
      });
      return true;
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        return false;
      }
      throw new Error(error);
    }
  }
  try {
    await codecommit.getFile(repositoryName!, fileName, branchName);
    return true;
  } catch (error) {
    if (
      error.code === 'FileDoesNotExistException' ||
      error.code === 'CommitDoesNotExistException' ||
      error.code === 'BranchDoesNotExistException'
    ) {
      return false;
    }
    throw new Error(error);
  }
}

async function validateExecution(stateMachineArn: string, executionArn: string) {
  const runningExecutions = await stepfunctions.listExecutions({
    stateMachineArn,
    statusFilter: 'RUNNING',
  });

  if (runningExecutions.filter(re => re.executionArn !== executionArn).length > 0) {
    await stepfunctions.stopExecution({
      executionArn,
    });
    return 'DUPLICATE_EXECUTION';
  }
  return 'SUCCESS';
}
