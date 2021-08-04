import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceDeleteEvent, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const iam = new AWS.IAM();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Create IAM Role...`);
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
  try {
    await throttlingBackOff(() =>
      iam
        .getRole({
          RoleName: event.ResourceProperties.roleName,
        })
        .promise(),
    );
  } catch (error) {
    if (error.code === 'NoSuchEntity') {
      console.log(error.message);
      const crossRole = await throttlingBackOff(() =>
        iam
          .createServiceLinkedRole({
            AWSServiceName: event.ResourceProperties.serviceName,
          })
          .promise(),
      );
    }
  }
  return {
    physicalResourceId: `IAM-ServiceRole-${event.ResourceProperties.roleName}`,
    data: {},
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Nothing to do for delete...`);
  if (event.PhysicalResourceId != `IAM-ServiceRole-${event.ResourceProperties.roleName}`) {
    return;
  }
  try {
    await throttlingBackOff(() =>
      iam
        .deleteRole({
          RoleName: event.ResourceProperties.roleName,
        })
        .promise(),
    );
  } catch (error) {
    console.warn('Exception while delete role', event.ResourceProperties.roleName);
    console.warn(error);
  }
}
