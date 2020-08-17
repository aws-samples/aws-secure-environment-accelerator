import * as AWS from 'aws-sdk';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

const physicalResourceId = 'GaurdGetDetoctorId';
const guardduty = new AWS.GuardDuty();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`GuardDuty Deligated Admin Account Setup...`);
  console.log(JSON.stringify(event, null, 2));

  // tslint:disable-next-line: switch-default
  switch (event.RequestType) {
    case 'Create':
      return onCreateOrUpdate(event);
    case 'Update':
      return onCreateOrUpdate(event);
  }
}

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const detectorId = await getDetectorId();
  return {
    physicalResourceId,
    data: {
      DetectorId: detectorId || 'NotFound',
    },
  };
}

async function getDetectorId(): Promise<string | undefined> {
  try {
    const detectors = await guardduty.listDetectors().promise();
    if (detectors.DetectorIds && detectors.DetectorIds.length > 0) {
      return detectors.DetectorIds[0];
    }
  } catch (e) {
    console.error(`Error Occured while listing Detectors ${e.code}: ${e.message}`);
    return;
  }
}
