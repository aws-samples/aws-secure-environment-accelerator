import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceDeleteEvent, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const ssm = new AWS.SSM();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Updating SSM Parameter Store throughput...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
}

async function onCreateOrUpdate(_: CloudFormationCustomResourceEvent) {
  try {
    await throttlingBackOff(() =>
      ssm
        .updateServiceSetting({
          SettingId: '/ssm/parameter-store/high-throughput-enabled',
          SettingValue: 'true',
        })
        .promise(),
    );
  } catch (error) {
    console.warn('Error while setting limit to ssm parameter store');
    console.warn(error);
  }
  return {
    physicalResourceId: `/ssm/parameter-store/high-throughput-enabled`,
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  if (event.PhysicalResourceId === '/ssm/parameter-store/high-throughput-enabled') {
    try {
      await throttlingBackOff(() =>
        ssm
          .updateServiceSetting({
            SettingId: '/ssm/parameter-store/high-throughput-enabled',
            SettingValue: 'false',
          })
          .promise(),
      );
    } catch (error) {
      console.warn('Error while setting limit to ssm parameter store');
      console.warn(error);
    }
  }
}
