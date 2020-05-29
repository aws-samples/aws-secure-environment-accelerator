import * as AWS from 'aws-sdk';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';

const ec2 = new AWS.EC2();
const secretsManager = new AWS.SecretsManager();

export interface HandlerProperties {
  keyName: string;
  secretPrefix: string;
}

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
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
};

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const response = await generateKeypair(event);
  return {
    physicalResourceId: response,
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
    physicalResourceId: response,
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
    physicalResourceId: response,
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

    const params = {
      Name: `${properties.secretPrefix}/${properties.keyName}`,
      SecretString: response.KeyMaterial,
    };
    const smResponse = await secretsManager.createSecret(params).promise();

    return smResponse;
  } catch (e) {
    throw e;
  }
}

async function deleteKeypair(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  try {
    const params = {
      SecretId: `${properties.secretPrefix}/${properties.keyName}`,
    };

    return await secretsManager.deleteSecret(params).promise();
  } catch (e) {
    throw e;
  }
}
