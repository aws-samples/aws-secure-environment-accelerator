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
  serviceId: string;
  allowedPrincipals: string[];
}

const ec2 = new AWS.EC2();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`ModifyVpcEndpointServicePermissionsProps to Ec2 Endpoint Service..`);
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
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { serviceId, allowedPrincipals } = properties;
  await throttlingBackOff(() =>
    ec2
      .modifyVpcEndpointServicePermissions({
        ServiceId: serviceId,
        AddAllowedPrincipals: allowedPrincipals,
      })
      .promise(),
  );
  return {
    physicalResourceId: `ModifyVpcEndpointServicePermissions-${serviceId}`,
  };
}

async function onUpdate(event: CloudFormationCustomResourceUpdateEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { allowedPrincipals, serviceId } = properties;

  const oldProperties = (event.OldResourceProperties as unknown) as HandlerProperties;
  const newPrincipals = allowedPrincipals.filter(rule => !oldProperties.allowedPrincipals.includes(rule));
  const removePrincipals = oldProperties.allowedPrincipals.filter(rule => !allowedPrincipals.includes(rule));
  await throttlingBackOff(() =>
    ec2
      .modifyVpcEndpointServicePermissions({
        ServiceId: serviceId,
        AddAllowedPrincipals: newPrincipals,
        RemoveAllowedPrincipals: removePrincipals,
      })
      .promise(),
  );
  return {
    physicalResourceId: `ModifyVpcEndpointServicePermissions-${serviceId}`,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { allowedPrincipals, serviceId } = properties;
  if (event.PhysicalResourceId !== `ModifyVpcEndpointServicePermissions-${serviceId}`) {
    return;
  }
  await throttlingBackOff(() =>
    ec2
      .modifyVpcEndpointServicePermissions({
        ServiceId: serviceId,
        RemoveAllowedPrincipals: allowedPrincipals,
      })
      .promise(),
  );
}
