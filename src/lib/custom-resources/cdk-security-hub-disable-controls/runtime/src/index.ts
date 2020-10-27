import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

const hub = new AWS.SecurityHub();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Disable Security Hub Standards specific controls...`);
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
  const standards = event.ResourceProperties.standards;
  const standardsResponse = await throttlingBackOff(() => hub.describeStandards().promise());
  const enabledStandardsResponse = await throttlingBackOff(() => hub.getEnabledStandards().promise());

  // Getting standards and disabling specific Controls for each standard
  for (const standard of standards) {
    const standardArn = standardsResponse.Standards?.find(x => x.Name === standard.name)?.StandardsArn;
    const standardSubscriptionArn = enabledStandardsResponse.StandardsSubscriptions?.find(
      s => s.StandardsArn === standardArn,
    )?.StandardsSubscriptionArn;

    const standardControls = await throttlingBackOff(() =>
      hub
        .describeStandardsControls({
          StandardsSubscriptionArn: standardSubscriptionArn!,
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
      await throttlingBackOff(() =>
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

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
