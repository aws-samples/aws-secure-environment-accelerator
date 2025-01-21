/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  paginateDescribeStacks,
  Parameter,
  UpdateStackCommand,
} from '@aws-sdk/client-cloudformation';
import {
  CodeCommitClient,
  CreateCommitCommand,
  CreateRepositoryCommand,
  CreateRepositoryCommandInput,
  GetRepositoryCommand,
  RepositoryDoesNotExistException,
} from '@aws-sdk/client-codecommit';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import * as conversion from '../common/utils/conversion';

export async function getInstallerStackName(
  region: string,
): Promise<{ stackName: string; parameters: Parameter[] } | undefined> {
  const cloudformationPaginationConfig = {
    client: new CloudFormationClient({ region: region }),
    pageSize: 10,
  };

  let installerStackName: string | undefined = undefined;
  const parameters: Parameter[] = [];

  const paginator = paginateDescribeStacks(cloudformationPaginationConfig, {});
  for await (const page of paginator) {
    for (const stack of page.Stacks!) {
      if (
        stack.Parameters?.find((item) => item.ParameterKey === 'ConfigRepositoryName') &&
        stack.Parameters?.find((item) => item.ParameterKey === 'CodeBuildComputeType') &&
        stack.Parameters?.find((item) => item.ParameterKey === 'AcceleratorName')
      ) {
        installerStackName = stack.StackName;
        parameters.push(...stack.Parameters);
        return { stackName: installerStackName!, parameters };
      }
    }
  }

  return installerStackName;
}

export async function writeConfigFile(parameters: string): Promise<void> {
  await fs.writeFile(path.join(__dirname, '../input-config/input-config.json'), parameters, 'utf-8');
}

export async function getS3BucketName(bucketNamePrefix: string, region: string): Promise<string | undefined> {
  let s3BucketName: string = '';
  const s3Client = new S3Client({ region: region });

  const listBucketsResponse = await s3Client.send(new ListBucketsCommand({}));
  for (const bucket of listBucketsResponse.Buckets!) {
    if (bucket.Name?.startsWith(bucketNamePrefix.toLowerCase())) {
      s3BucketName = bucket.Name;
      break;
    }
  }
  return s3BucketName;
}

export async function createRepository(
  name: string,
  description: string,
  region: string,
  localUpdateOnly: boolean,
): Promise<string | undefined> {
  if (localUpdateOnly) {
    return;
  }
  const codecommitClient = new CodeCommitClient({ region });
  try {
    const getRepositoryResponse = await codecommitClient.send(new GetRepositoryCommand({ repositoryName: name }));
    if (getRepositoryResponse.repositoryMetadata) {
      return getRepositoryResponse.repositoryMetadata?.repositoryId;
    }
  } catch (e: any) {
    if (e instanceof RepositoryDoesNotExistException) {
      console.log(`Repository ${name} does not exist. Creating repository.`);
    } else {
      throw e;
    }
  }
  const repositoryParameters: CreateRepositoryCommandInput = {
    repositoryName: name,
    repositoryDescription: description,
  };
  const createRepositoryResponse = await codecommitClient.send(new CreateRepositoryCommand(repositoryParameters));

  await codecommitClient.send(
    new CreateCommitCommand({
      branchName: 'main',
      repositoryName: name,
      putFiles: [{ filePath: 'README', fileContent: conversion.encodeBase64('README') }],
    }),
  );
  return createRepositoryResponse.repositoryMetadata?.repositoryId;
}

export async function createS3CloudFormationStack(
  stackName: string,
  bucketName: string,
  region: string,
  localUpdateOnly: boolean,
): Promise<void> {
  if (localUpdateOnly) {
    return;
  }
  const cloudformationClient = new CloudFormationClient({ region });

  const stackTemplate = await fs.readFile(path.join(__dirname, '../cloudformation/mapping-output-bucket.yml'), 'utf-8');

  const cloudformationParameters = {
    StackName: stackName,
    TemplateBody: stackTemplate,
    Parameters: [
      {
        ParameterKey: 'S3BucketName',
        ParameterValue: bucketName,
      },
    ],
  };

  let createStack = false;
  try {
    await cloudformationClient.send(new DescribeStacksCommand({ StackName: stackName }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      console.log('S3 stack does not exist');
      createStack = true;
    }
  }

  if (createStack) {
    console.log('Creating S3 stack');
    await cloudformationClient.send(new CreateStackCommand(cloudformationParameters));
  } else {
    try {
      await cloudformationClient.send(new UpdateStackCommand(cloudformationParameters));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.name === 'ValidationError') {
        console.log('S3 stack has no updates');
      }
    }
  }

  let stackStatus = 'CREATE_IN_PROGRESS';
  while (stackStatus === 'CREATE_IN_PROGRESS' || stackStatus === 'UPDATE_IN_PROGRESS') {
    const describeStacksResponse = await cloudformationClient.send(new DescribeStacksCommand({ StackName: stackName }));
    stackStatus = describeStacksResponse.Stacks![0].StackStatus!;
    console.log(`Stack status: ${stackStatus}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (stackStatus === 'CREATE_COMPLETE' || 'UPDATE_COMPLETE') {
    console.log(`Created/Updated CloudFormation stack ${stackName}`);
  } else {
    throw new Error(`Failed to create/update CloudFormation stack ${stackName} with status ${stackStatus}`);
  }
}
