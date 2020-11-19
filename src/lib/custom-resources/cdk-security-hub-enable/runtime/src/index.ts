import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

const hub = new AWS.SecurityHub();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Enabling Security Hub and Security Hub Standards...`);
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
    await throttlingBackOff(() => hub.enableSecurityHub().promise());
  } catch (error) {
    if (error.code === 'ResourceConflictException') {
      console.log('Account is already subscribed to Security Hub');
    } else {
      throw new Error(error);
    }
  }

  const standards = event.ResourceProperties.standards;
  const standardsResponse = await throttlingBackOff(() => hub.describeStandards().promise());

  // Enable standards based on input
  for (const standard of standards) {
    const standardArn = standardsResponse.Standards?.find(x => x.Name === standard.name)?.StandardsArn;
    await throttlingBackOff(() =>
      hub
        .batchEnableStandards({
          StandardsSubscriptionRequests: [
            {
              StandardsArn: standardArn!,
            },
          ],
        })
        .promise(),
    );
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
