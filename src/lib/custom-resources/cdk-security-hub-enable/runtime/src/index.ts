import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { backOff } from 'exponential-backoff';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

const hub = new AWS.SecurityHub();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Enabling Security Hub Standards...`);
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
  try {
    await backOff(() => hub.enableSecurityHub().promise());
  } catch (error) {
    if (error.code === 'ResourceConflictException') {
      console.log('Account is already subscribed to Security Hub');
    } else {
      throw new Error(error);
    }
  }

  const standards = event.ResourceProperties.standards;
  const standardsResponse = await hub.describeStandards().promise();

  // Enable standards and Disabling unnecessary Controls for eash standard
  for (const standard of standards) {
    const standardArn = standardsResponse.Standards?.find(x => x.Name === standard.name)?.StandardsArn;

    const enableResponse = await backOff(() =>
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

    await new Promise(resolve => setTimeout(resolve, 3000));

    for (const responseStandard of enableResponse.StandardsSubscriptions || []) {
      const standardControls = await backOff(() =>
        hub
          .describeStandardsControls({
            StandardsSubscriptionArn: responseStandard.StandardsSubscriptionArn,
            MaxResults: 100,
          })
          .promise(),
      );
      for (const disableControl of standard['controls-to-disable']) {
        const standardControl = standardControls.Controls?.find(x => x.ControlId === disableControl);
        if (!standardControl) {
          console.log(`Control "${disableControl}" not found for Standard "${standard.name}"`);
          continue;
        }

        console.log(`Disabling Control "${disableControl}" for Standard "${standard.name}"`);
        await backOff(() =>
          hub
            .updateStandardsControl({
              StandardsControlArn: standardControl.StandardsControlArn!,
              ControlStatus: 'DISABLED',
              DisabledReason: 'Control disabled by Accelerator',
            })
            .promise(),
        );
      }
    }
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
