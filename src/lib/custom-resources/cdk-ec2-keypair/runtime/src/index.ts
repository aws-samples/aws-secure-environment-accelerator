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
import { EC2 } from '@aws-sdk/client-ec2';
import { SecretsManager } from '@aws-sdk/client-secrets-manager';
// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const ec2 = new EC2({
  logger: console,
});
const secretsManager = new SecretsManager({
  logger: console,
});

export interface HandlerProperties {
  keyName: string;
  secretPrefix: string;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Generating keypair...`);
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

function getPhysicalId(event: CloudFormationCustomResourceEvent): string {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  return `${properties.secretPrefix}${properties.keyName}`;
}

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const response = await generateKeypair(properties);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {
      KeyName: response.KeyName,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  // delete old keypair
  // TODO Do not delete the old keypair if the name did not change
  //      This could happen when the `secretPrefix` changes
  const oldProperties = (event.OldResourceProperties as unknown) as HandlerProperties;
  await deleteKeypair(oldProperties);

  // create new keypair
  const newProperties = (event.ResourceProperties as unknown) as HandlerProperties;
  const response = await generateKeypair(newProperties);
  return {
    physicalResourceId: getPhysicalId(event),
    data: {
      KeyName: response.KeyName,
    },
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const physicalResourceId = getPhysicalId(event);
  if (physicalResourceId !== event.PhysicalResourceId) {
    return;
  }
  await deleteKeypair(properties);
  return {
    physicalResourceId,
  };
}

async function generateKeypair(properties: HandlerProperties) {
  const createKeyPair = await throttlingBackOff(() =>
    ec2
      .createKeyPair({
        KeyName: properties.keyName,
      }),
  );

  const secretName = `${properties.secretPrefix}${properties.keyName}`;
  try {
    await throttlingBackOff(() =>
      secretsManager
        .createSecret({
          Name: secretName,
          SecretString: createKeyPair.KeyMaterial,
        }),
    );
  } catch (e) {
    const message = `${e}`;
    if (!message.includes(`already scheduled for deletion`)) {
      throw e;
    }

    // Restore the deleted secret and put the key material in
    await throttlingBackOff(() =>
      secretsManager
        .restoreSecret({
          SecretId: secretName,
        }),
    );
    await throttlingBackOff(() =>
      secretsManager
        .putSecretValue({
          SecretId: secretName,
          SecretString: createKeyPair.KeyMaterial,
        }),
    );
  }
  return createKeyPair;
}

async function deleteKeypair(properties: HandlerProperties) {
  await throttlingBackOff(() =>
    ec2
      .deleteKeyPair({
        KeyName: properties.keyName,
      }),
  );

  const secretName = `${properties.secretPrefix}${properties.keyName}`;
  await throttlingBackOff(() =>
    secretsManager
      .deleteSecret({
        SecretId: secretName,
      }),
  );
}
