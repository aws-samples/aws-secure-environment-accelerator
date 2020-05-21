import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';

const hub = new AWS.SecurityHub();

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
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
};

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const standards = event.ResourceProperties.standards;
  const standardsResponse = await hub.describeStandards().promise();

  // Enable standards and Disabling unnecessary Controls for eash standard
  for (const standard of standards) {
    const standardArn = standardsResponse.Standards?.find(x => x.Name === standard.name)?.StandardsArn;

    const params = {
      StandardsSubscriptionRequests: [
        {
          StandardsArn: standardArn!,
        },
      ],
    };

    const enableResonse = await hub.batchEnableStandards(params).promise();
    new Promise(resolve => setTimeout(resolve, 3000));
    for (const responseStandard of enableResonse.StandardsSubscriptions || []) {
      const standardControls = await hub
        .describeStandardsControls({
          StandardsSubscriptionArn: responseStandard.StandardsSubscriptionArn,
          MaxResults: 100,
        })
        .promise();
      for (const disableConrtol of standard['controls-to-disable']) {
        const standardControl = standardControls.Controls?.find(x => x.ControlId === disableConrtol);
        if (standardControl) {
          console.log(`Disabling Control "${disableConrtol}" for Standard "${standard.name}"`);
          await hub.updateStandardsControl({
              StandardsControlArn: standardControl.StandardsControlArn!,
              ControlStatus: 'DISABLED',
              DisabledReason: 'Not Required Done through Accelerator',
            })
            .promise();
        } else {
          console.log(`Control "${disableConrtol}" not found for Standard "${standard.name}"`);
        }
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
