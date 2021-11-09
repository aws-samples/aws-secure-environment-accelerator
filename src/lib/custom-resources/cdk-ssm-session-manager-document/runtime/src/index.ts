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

import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { CreateDocumentRequest, UpdateDocumentRequest } from 'aws-sdk/clients/ssm';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  s3BucketName: string;
  s3KeyPrefix: string;
  s3EncryptionEnabled: boolean;
  cloudWatchLogGroupName: string;
  cloudWatchEncryptionEnabled: boolean;
  kmsKeyId: string;
}

const docuemntName = 'SSM-SessionManagerRunShell';

const ssm = new AWS.SSM();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Creating SSM Document...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

function getPropertiesFromEvent(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  if (typeof properties.cloudWatchEncryptionEnabled === 'string') {
    properties.cloudWatchEncryptionEnabled = properties.cloudWatchEncryptionEnabled === 'true';
  }
  if (typeof properties.s3EncryptionEnabled === 'string') {
    properties.s3EncryptionEnabled = properties.s3EncryptionEnabled === 'true';
  }
  return properties;
}

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const properties = getPropertiesFromEvent(event);
  const {
    cloudWatchEncryptionEnabled,
    cloudWatchLogGroupName,
    kmsKeyId,
    s3BucketName,
    s3EncryptionEnabled,
    s3KeyPrefix,
  } = properties;
  // Based on doc: https://docs.aws.amazon.com/systems-manager/latest/userguide/getting-started-configure-preferences-cli.html
  const settings = {
    schemaVersion: '1.0',
    description: 'Document to hold regional settings for Session Manager',
    sessionType: 'Standard_Stream',
    inputs: {
      cloudWatchEncryptionEnabled,
      cloudWatchLogGroupName,
      kmsKeyId,
      s3BucketName,
      s3EncryptionEnabled,
      s3KeyPrefix,
      runAsEnabled: false,
      runAsDefaultUser: '',
    },
  };

  try {
    await throttlingBackOff(() =>
      ssm
        .describeDocument({
          Name: docuemntName,
        })
        .promise(),
    );
    const updateDocumentRequest: UpdateDocumentRequest = {
      Content: JSON.stringify(settings),
      Name: docuemntName,
      DocumentVersion: '$LATEST',
    };
    console.log('Update SSM Document Request: ', updateDocumentRequest);
    await throttlingBackOff(() => ssm.updateDocument(updateDocumentRequest).promise());
    console.log('Update SSM Document Success');
  } catch (error) {
    if (error.code === 'DuplicateDocumentContent') {
      console.log(`SSM Document is Already latest :${docuemntName}`);
    } else if (error.code === 'InvalidDocument') {
      const createDocumentRequest: CreateDocumentRequest = {
        Content: JSON.stringify(settings),
        Name: docuemntName,
        DocumentType: `Session`,
      };
      console.log('Create SSM Document Request: ', createDocumentRequest);
      await throttlingBackOff(() => ssm.createDocument(createDocumentRequest).promise());
      console.log('Create SSM Document Success');
    } else {
      throw error;
    }
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
