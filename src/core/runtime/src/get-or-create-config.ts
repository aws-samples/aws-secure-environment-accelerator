/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';
import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { RawConfig } from '@aws-accelerator/common/src/util/common';
import { JSON_FORMAT, RAW_CONFIG_FILE, YAML_FORMAT } from '@aws-accelerator/common/src/util/constants';
import { StepFunctions } from '@aws-accelerator/common/src/aws/stepfunctions';
import { CloudFormation } from '@aws-accelerator/common/src/aws/cloudformation';
import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import { getCommitIdSecretName } from '@aws-accelerator/common-outputs/src/commitid-secret';

interface GetOrCreateConfigInput {
  repositoryName: string;
  s3Bucket: string;
  branchName: string;
  executionArn: string;
  stateMachineArn: string;
  acceleratorPrefix: string;
  acceleratorName: string;
  region: string;
  acceleratorVersion?: string;
  // Taking entire input to replace any default paramaters in SM Input
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smInput?: any;
}

const codecommit = new CodeCommit();
const s3 = new S3();
const stepfunctions = new StepFunctions();
const cfn = new CloudFormation();
const secrets = new SecretsManager();

export const handler = async (input: GetOrCreateConfigInput) => {
  console.log(`Get or Create Config from S3 file...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    repositoryName,
    s3Bucket,
    branchName,
    acceleratorVersion,
    smInput,
    executionArn,
    stateMachineArn,
    acceleratorPrefix,
    region,
    acceleratorName,
  } = input;
  await beforeStart(
    acceleratorPrefix,
    stateMachineArn,
    executionArn,
    acceleratorVersion!,
    smInput?.scope,
    smInput?.mode,
  );
  const storeAllOutputs: boolean = !!smInput && !!smInput.storeAllOutputs;
  const configRepository = await codecommit.batchGetRepositories([repositoryName]);
  if (!configRepository.repositories || configRepository.repositories?.length === 0) {
    console.log(`Creating repository "${repositoryName}" for Config file`);
    await codecommit.createRepository(repositoryName, 'This repository contains configuration');
    console.log(`Creation of repository "${repositoryName}" is done for Config file`);
  } else if (
    configRepository.repositories[0].defaultBranch &&
    configRepository.repositories[0].defaultBranch !== branchName
  ) {
    const previousCommit = await codecommit.getBranch(repositoryName, configRepository.repositories[0].defaultBranch);
    try {
      const currentBranch = await codecommit.getBranch(repositoryName, branchName);
      if (!currentBranch.branch) {
        await codecommit.createBranch(repositoryName, branchName, previousCommit.branch?.commitId!);
      }
    } catch (e) {
      if (e.code === 'BranchDoesNotExistException') {
        await codecommit.createBranch(repositoryName, branchName, previousCommit.branch?.commitId!);
      }
    }
    await codecommit.updateDefaultBranch(repositoryName, branchName);
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
        region,
        acceleratorName,
        acceleratorPrefix,
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
        smInput: smInput || {},
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
      region,
      acceleratorName,
      acceleratorPrefix,
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
      smInput: smInput || {},
    };
  } catch (e) {
    if (e.code !== 'FileDoesNotExistException' && e.code !== 'CommitDoesNotExistException') {
      throw new Error(e);
    }
    const s3LoadResponse = await loadConfigFromS3({
      branchName,
      repositoryName,
      s3Bucket,
      region,
      acceleratorName,
      acceleratorPrefix,
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
      smInput: smInput || {},
    };
  }
};

async function loadConfigFromS3(props: {
  branchName: string;
  repositoryName: string;
  s3Bucket: string;
  region: string;
  acceleratorName: string;
  acceleratorPrefix: string;
}) {
  const { branchName, repositoryName, s3Bucket, region, acceleratorName, acceleratorPrefix } = props;
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
    region,
    acceleratorName,
    acceleratorPrefix,
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

async function beforeStart(
  acceleratorPrefix: string,
  stateMachineArn: string,
  executionArn: string,
  acceleratorVersion: string,
  scope: string,
  mode: string,
) {
  const installRolesStack = await cfn.describeStackSet(`${acceleratorPrefix}PipelineRole`);
  if (installRolesStack) {
    throw new Error(
      'This upgrade requires the manual removal of the "PBMMAccel-PipelineRole" Stackset from this account - see upgrade instructions',
    );
  }
  const runningStatus = await validateExecution(stateMachineArn, executionArn);
  if (runningStatus === 'DUPLICATE_EXECUTION') {
    throw new Error('Another execution of Accelerator is already running');
  }
  const commitSecretId = getCommitIdSecretName();
  let previousExecutionSecret;
  let previousExecutionData;
  let previousAcceleratorVersion;
  try {
    previousExecutionSecret = await secrets.getSecret(commitSecretId);
  } catch (e) {
    console.warn(e);
    if (e.code !== 'ResourceNotFoundException') {
      throw new Error(e);
    }
  }
  if (previousExecutionSecret) {
    try {
      previousExecutionData = JSON.parse(previousExecutionSecret.SecretString || '{}');
      if (previousExecutionData && previousExecutionData.acceleratorVersion) {
        previousAcceleratorVersion = previousExecutionData.acceleratorVersion;
      }
    } catch (e) {
      console.error('Previous Successfull Secret is a String');
      if (scope !== 'FULL') {
        throw new Error('This execition requires Accelerator execution with scope: "FULL"');
      }
    }
  }
  if (!previousAcceleratorVersion && scope !== 'FULL') {
    throw new Error('This execition requires Accelerator execution with scope: "FULL"');
  } else if (previousAcceleratorVersion !== acceleratorVersion && scope !== 'FULL') {
    throw new Error('This execition requires Accelerator execution with scope: "FULL"');
  }

  if ((scope && !mode) || (scope && mode && mode !== 'APPLY')) {
    throw new Error('Input mode: "APPLY" is required when "scope" is provided');
  }
}
