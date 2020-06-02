import * as AWS from 'aws-sdk';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@custom-resources/cfn-response';

const ec2 = new AWS.EC2();
const secretsManager = new AWS.SecretsManager();

export interface HandlerProperties {
  keyName: string;
  secretPrefix: string;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Generating keypair...`);
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

async function getPhysicalId(event: CloudFormationCustomResourceEvent): Promise<string> {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  return `${properties.secretPrefix}${properties.keyName}`;
}

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const response = await generateKeypair(event);
  return {
    physicalResourceId: await getPhysicalId(event),
    data: {
      KeyName: response.Name,
      ARN: response.ARN,
      VersionId: response.VersionId,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const response = await generateKeypair(event);
  return {
    physicalResourceId: await getPhysicalId(event),
    data: {
      KeyName: response.Name,
      ARN: response.ARN,
      VersionId: response.VersionId,
    },
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const response = await deleteKeypair(event);
  return {
    physicalResourceId: await getPhysicalId(event),
    data: {
      KeyName: response.Name,
      ARN: response.ARN,
      DeletionDate: response.DeletionDate,
    },
  };
}

async function generateKeypair(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const physicalResourceId = 'PhysicalResourceId' in event ? event.PhysicalResourceId : undefined;

  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  try {
    const response = await ec2
      .createKeyPair({
        KeyName: properties.keyName,
      })
      .promise();
    console.log('Create Keypair: ', response);

    const params = {
      Name: physicalResourceId || `${properties.secretPrefix}${properties.keyName}`,
      SecretString: response.KeyMaterial,
    };

    console.log('Create Secret: ', params);
    const smResponse = await secretsManager.createSecret(params).promise();

    return smResponse;
  } catch (e) {
    throw e;
  }
}

async function deleteKeypair(event: CloudFormationCustomResourceDeleteEvent) {
  const physicalResourceId = 'PhysicalResourceId' in event ? event.PhysicalResourceId : undefined;
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  try {
    const response = await ec2
      .deleteKeyPair({
        KeyName: properties.keyName,
      })
      .promise();
    console.log('Delete Keypair: ', response);

    const params = {
      SecretId: physicalResourceId || `${properties.secretPrefix}${properties.keyName}`,
    };

    console.log('Delete Secret:', params);
    return await secretsManager.deleteSecret(params).promise();
  } catch (e) {
    throw e;
  }
}
