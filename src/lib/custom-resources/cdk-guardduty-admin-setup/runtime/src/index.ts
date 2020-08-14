import * as AWS from 'aws-sdk';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
} from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const physicalResourceId = 'GaurdDutyDeligatedAdminAccountSetup';
const guardduty = new AWS.GuardDuty();

export interface AccountDetail {
  AccountId: string;
  Email: string;
}

export interface HandlerProperties {
  deligatedAdminAccountId: string;
  memberAccounts: AccountDetail[];
}

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
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const detectorId = await getDetectorId();
  if (!detectorId) {
    console.warn(`Skipping Deligated Admin setup for GuardDuty as DetectorId not found`);
    return {
      physicalResourceId,
      data: {},
    };
  }

  const isAutoEnabled = await isConfigurationAutoEnabled(detectorId);
  if (isAutoEnabled) {
    console.log(`GuardDuty is already enabled ORG Level`);
    return {
      physicalResourceId,
      data: {},
    };
  }
  // Update Config to handle new Account created under Organization
  await updateConfig(detectorId);

  // Create Members in Security Account
  const { memberAccounts } = properties;
  if (memberAccounts.length > 0) {
    await createMembers(memberAccounts, detectorId);
  }

  return {
    physicalResourceId,
    data: {},
  };
}

async function getDetectorId(): Promise<string | undefined> {
  try {
    const detectors = await throttlingBackOff(() => guardduty.listDetectors().promise());
    if (detectors.DetectorIds && detectors.DetectorIds.length > 0) {
      return detectors.DetectorIds[0];
    }
  } catch (e) {
    console.error(`Error Occurred while listing Detectors ${e.code}: ${e.message}`);
    return;
  }
}

// Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
async function createMembers(memberAccounts: AccountDetail[], detectorId: string) {
  try {
    await throttlingBackOff(() =>
      guardduty
        .createMembers({
          AccountDetails: memberAccounts,
          DetectorId: detectorId,
        })
        .promise(),
    );
  } catch (error) {
    console.error(
      `Error Occurred while creating members in Delegater Account of GuardDuty ${error.code}: ${error.message}`,
    );
  }
}

// Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
async function updateConfig(detectorId: string) {
  try {
    await throttlingBackOff(() =>
      guardduty
        .updateOrganizationConfiguration({
          AutoEnable: true,
          DetectorId: detectorId,
        })
        .promise(),
    );
  } catch (error) {
    console.error(
      `Error Occurred while creating members in Delegater Account of GuardDuty ${error.code}: ${error.message}`,
    );
  }
}

// describe-organization-configuration to check if security hub is already enabled in org level or not
async function isConfigurationAutoEnabled(detectorId: string): Promise<boolean> {
  try {
    const response = await throttlingBackOff(() =>
      guardduty
        .describeOrganizationConfiguration({
          DetectorId: detectorId,
        })
        .promise(),
    );
    return response.AutoEnable;
  } catch (error) {
    console.error(
      `Error Occurred while creating members in Delegater Account of GuardDuty ${error.code}: ${error.message}`,
    );
    return false;
  }
}
