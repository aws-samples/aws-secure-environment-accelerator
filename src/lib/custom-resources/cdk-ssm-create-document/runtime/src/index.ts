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
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export interface HandlerProperties {
  content: string;
  name: string;
  type: string;
}

const ssm = new AWS.SSM();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log('SSM Document Create...');
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

async function onCreate(event: CloudFormationCustomResourceCreateEvent) {
  const { content, name, type } = (event.ResourceProperties as unknown) as HandlerProperties;
  await throttlingBackOff(() =>
    ssm
      .createDocument({
        Content: content,
        Name: name,
        DocumentType: type,
      })
      .promise(),
  );
  return {
    physicalResourceId: `SSMDocument-${name}`,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  console.log('SSM Document Update...');
  console.log(JSON.stringify(event, null, 2));
  const { content, name } = (event.ResourceProperties as unknown) as HandlerProperties;
  const ssmDocument = await throttlingBackOff(() =>
    ssm
      .updateDocument({
        Name: name,
        Content: content,
        DocumentVersion: '$LATEST',
      })
      .promise(),
  );

  await throttlingBackOff(() =>
    ssm
      .updateDocumentDefaultVersion({
        Name: name,
        DocumentVersion: ssmDocument.DocumentDescription?.DocumentVersion!,
      })
      .promise(),
  );
  return {
    physicalResourceId: `SSMDocument-${name}`,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log('SSM Document Delete...');
  console.log(JSON.stringify(event, null, 2));
  const { name } = (event.ResourceProperties as unknown) as HandlerProperties;
  if (event.PhysicalResourceId === `SSMDocument-${name}`) {
    try {
      const documentPermissions = await throttlingBackOff(() =>
        ssm
          .describeDocumentPermission({
            Name: name,
            PermissionType: 'Share',
          })
          .promise(),
      );
      if (documentPermissions.AccountIds && documentPermissions.AccountIds.length > 0) {
        await throttlingBackOff(() =>
          ssm
            .modifyDocumentPermission({
              Name: name,
              PermissionType: 'Share',
              AccountIdsToRemove: documentPermissions.AccountIds,
            })
            .promise(),
        );
      }

      await throttlingBackOff(() =>
        ssm
          .deleteDocument({
            Name: name,
          })
          .promise(),
      );
    } catch (error) {
      console.warn(`Error while Deleting SSM Document ${name}`);
      console.warn(error);
    }
  }
}
