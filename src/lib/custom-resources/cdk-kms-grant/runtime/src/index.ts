import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const kms = new AWS.KMS();

export type HandlerProperties = AWS.KMS.CreateGrantRequest;

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Creating KMS grant...`);
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
