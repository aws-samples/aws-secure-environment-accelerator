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
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const kms = new AWS.KMS();

export type HandlerProperties = AWS.KMS.CreateGrantRequest;

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Creating KMS grant...`);
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

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const grant = await throttlingBackOff(() =>
    kms
      .createGrant({
        Name: properties.Name,
        KeyId: properties.KeyId,
        GranteePrincipal: properties.GranteePrincipal,
        RetiringPrincipal: properties.RetiringPrincipal,
        Operations: properties.Operations,
        Constraints: properties.Constraints,
        GrantTokens: properties.GrantTokens,
      })
      .promise(),
  );
  return {
    physicalResourceId: grant.GrantId!,
    data: {
      GrantId: grant.GrantId,
      GrantToken: grant.GrantToken,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  // When the grant fails to create, the physical resource ID will not be set
  if (!event.PhysicalResourceId) {
    console.log(`Skipping deletion of grant`);
    return;
  }

  await throttlingBackOff(() =>
    kms
      .revokeGrant({
        GrantId: event.PhysicalResourceId,
        KeyId: properties.KeyId,
      })
      .promise(),
  );
}
