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

import * as fs from 'fs';
import * as path from 'path';

import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import { Capability, CloudFormationClient, CreateStackCommand, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

export interface InstallerStackParameters {
  repositorySource: string;
  repositoryOwner: string;
  repositoryName: string;
  repositoryBranchName: string | undefined;
  enableApprovalStage: string;
  approvalStageNotifyEmailList: string;
  managementAccountEmail: string;
  logArchiveAccountEmail: string;
  auditAccountEmail: string;
  controlTowerEnabled: string;
  acceleratorPrefix: string;
  configurationRepositoryLocation: string;
  useExistingConfigRepo: string;
  existingConfigRepositoryName: string;
  existingConfigRepositoryBranchName: string;
  enableDiagnosticsPack: string;
}

export async function createLZAInstallerCloudFormationStack(
  stackName: string,
  stackParameters: InstallerStackParameters,
  stackPath: string,
  region: string,
): Promise<void> {
  const cloudformationClient = new CloudFormationClient({ region });
  const parameters = [
    {
      ParameterKey: 'RepositorySource',
      ParameterValue: stackParameters.repositorySource,
    },
    {
      ParameterKey: 'RepositoryOwner',
      ParameterValue: stackParameters.repositoryOwner,
    },
    {
      ParameterKey: 'RepositoryName',
      ParameterValue: stackParameters.repositoryName,
    },
    {
      ParameterKey: 'EnableApprovalStage',
      ParameterValue: stackParameters.enableApprovalStage,
    },
    {
      ParameterKey: 'ApprovalStageNotifyEmailList',
      ParameterValue: stackParameters.approvalStageNotifyEmailList,
    },
    {
      ParameterKey: 'ManagementAccountEmail',
      ParameterValue: stackParameters.managementAccountEmail,
    },
    {
      ParameterKey: 'LogArchiveAccountEmail',
      ParameterValue: stackParameters.logArchiveAccountEmail,
    },
    {
      ParameterKey: 'AuditAccountEmail',
      ParameterValue: stackParameters.auditAccountEmail,
    },
    {
      ParameterKey: 'ControlTowerEnabled',
      ParameterValue: stackParameters.controlTowerEnabled,
    },
    {
      ParameterKey: 'ConfigurationRepositoryLocation',
      ParameterValue: stackParameters.configurationRepositoryLocation,
    },
    {
      ParameterKey: 'UseExistingConfigRepo',
      ParameterValue: stackParameters.useExistingConfigRepo,
    },
    {
      ParameterKey: 'ExistingConfigRepositoryName',
      ParameterValue: stackParameters.existingConfigRepositoryName,
    },
    {
      ParameterKey: 'ExistingConfigRepositoryBranchName',
      ParameterValue: stackParameters.existingConfigRepositoryBranchName,
    },
    {
      ParameterKey: 'AcceleratorPrefix',
      ParameterValue: stackParameters.acceleratorPrefix,
    },
    {
      ParameterKey: 'EnableDiagnosticsPack',
      ParameterValue: stackParameters.enableDiagnosticsPack,
    },
  ];

  // override config value with environment variable
  const repositoryBranchName = process.env.REPOSITORY_BRANCH_NAME ?? undefined;
  if (repositoryBranchName) {
    parameters.push( {
      ParameterKey: 'RepositoryBranchName',
      ParameterValue: repositoryBranchName,
    });
  }

  if (stackParameters.repositoryBranchName && !repositoryBranchName) {
    parameters.push( {
      ParameterKey: 'RepositoryBranchName',
      ParameterValue: stackParameters.repositoryBranchName,
    });
  }

  const cloudformationParameters = {
    StackName: stackName,
    TemplateURL: stackPath,
    Capabilities: [Capability.CAPABILITY_IAM],
    Parameters: parameters,
  };
  await cloudformationClient.send(new CreateStackCommand(cloudformationParameters));

  let stackStatus = 'CREATE_IN_PROGRESS';
  while (stackStatus === 'CREATE_IN_PROGRESS') {
    const describeStacksResponse = await cloudformationClient.send(new DescribeStacksCommand({ StackName: stackName }));
    stackStatus = describeStacksResponse.Stacks![0].StackStatus!;
    console.log(`Stack status: ${stackStatus}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (stackStatus === 'CREATE_COMPLETE') {
    console.log(`Created CloudFormation stack ${stackName}`);
  } else {
    throw new Error(`Failed to create CloudFormation stack ${stackName} with status ${stackStatus}`);
  }
}

export async function getLZAInstallerStackTemplate(bucketName: string, outputPath: string) {
  const s3Client = new S3Client({ endpoint: 'https://s3.amazonaws.com', region: 'us-east-1' });
  const template = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: 'solutions-reference/landing-zone-accelerator-on-aws/latest/AWSAccelerator-InstallerStack.template',
    }),
  );

  if (!template.Body) {
    throw new Error('Template not found');
  }

  await pipeline(
    template.Body as Readable,
    fs.createWriteStream(path.join(__dirname, outputPath, 'AWSAccelerator-InstallerStack.template')),
  );
}

export async function putLZAInstallerStackTemplate(bucketName: string, templatePath: string, region: string) {
  const s3Client = new S3Client({ region });
  const template = fs.readFileSync(path.join(__dirname, templatePath, 'AWSAccelerator-InstallerStack.template'));
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: 'AWSAccelerator-InstallerStack.template',
      Body: template,
    }),
  );
}
