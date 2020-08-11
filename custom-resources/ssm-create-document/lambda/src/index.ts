import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { backOff } from 'exponential-backoff';
import { errorHandler } from '@custom-resources/cfn-response';
import { CreateDocumentRequest, UpdateDocumentRequest } from 'aws-sdk/clients/ssm';

const ssm = new AWS.SSM();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Creating SSM Document...`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const params = event.ResourceProperties;
  const {
    s3BucketName,
    s3KeyPrefix,
    s3EncryptionEnabled,
    cloudWatchLogGroupName,
    cloudWatchEncryptionEnabled,
    kmsKeyId,
    documentName,
    documentType,
  } = params;
  // Based on doc: https://docs.aws.amazon.com/systems-manager/latest/userguide/getting-started-configure-preferences-cli.html
  const settings = {
    schemaVersion: '1.0',
    description: 'Document to hold regional settings for Session Manager',
    sessionType: 'Standard_Stream',
    inputs: {
      s3BucketName,
      s3KeyPrefix, // TODO: add region when region is available to pass in
      s3EncryptionEnabled,
      cloudWatchLogGroupName,
      cloudWatchEncryptionEnabled,
      kmsKeyId,
      runAsEnabled: false,
      runAsDefaultUser: '',
    },
  };

  try {
    await ssm
      .describeDocument({
        Name: documentName,
      })
      .promise();
    const updateDocumentRequest: UpdateDocumentRequest = {
      Content: JSON.stringify(settings),
      Name: 'SSM-SessionManagerRunShell',
      DocumentVersion: '$LATEST',
    };
    console.log('Update SSM Document Request: ', updateDocumentRequest);
    await backOff(() => ssm.updateDocument(updateDocumentRequest).promise());
    console.log('Update SSM Document Success');
  } catch (error) {
    if (error.code === 'InvalidDocument') {
      const createDocumentRequest: CreateDocumentRequest = {
        Content: JSON.stringify(settings),
        Name: 'SSM-SessionManagerRunShell',
        DocumentType: documentType,
      };
      console.log('Create SSM Document Request: ', createDocumentRequest);
      await backOff(() => ssm.createDocument(createDocumentRequest).promise());
      console.log('Create SSM Document Success');
    }
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
