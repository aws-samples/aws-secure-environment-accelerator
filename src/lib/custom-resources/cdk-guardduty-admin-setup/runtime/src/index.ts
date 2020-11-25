import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
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
  s3Protection: boolean;
}

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`GuardDuty Deligated Admin Account Setup...`);
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

async function onCreateOrUpdate(
  event: CloudFormationCustomResourceCreateEvent | CloudFormationCustomResourceUpdateEvent,
) {
  const properties = getPropertiesFromEvent(event);
  const detectorId = await getDetectorId();
  if (!detectorId) {
    console.warn(`Skipping Delegated Admin setup for GuardDuty as DetectorId not found`);
    return {
      physicalResourceId,
      data: {},
    };
  }

  const { memberAccounts, s3Protection } = properties;
  await updateS3Protection(detectorId, s3Protection);

  const isAutoEnabled = await isConfigurationAutoEnabled(detectorId, s3Protection);
  if (isAutoEnabled) {
    console.log(`GuardDuty is already enabled ORG Level`);
    return {
      physicalResourceId,
      data: {},
    };
  }

  // Update Config to handle new Account created under Organization
  await updateConfig(detectorId, s3Protection);

  if (memberAccounts.length > 0) {
    await createMembers(memberAccounts, detectorId);
    await updateMemberDataSource(memberAccounts, detectorId, s3Protection);
  }

  return {
    physicalResourceId,
    data: {},
  };
}

async function getDetectorId(): Promise<string | undefined> {
  try {
    console.log(`Calling api "guardduty.listDetectors()"`);
    const detectors = await throttlingBackOff(() => guardduty.listDetectors().promise());
    if (detectors.DetectorIds && detectors.DetectorIds.length > 0) {
      return detectors.DetectorIds[0];
    }
  } catch (e) {
    console.error(`Error Occurred while listing Detectors ${e.code}: ${e.message}`);
    throw e;
  }
}

// Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
async function createMembers(memberAccounts: AccountDetail[], detectorId: string) {
  try {
    console.log(`Calling api "guardduty.createMembers()", ${memberAccounts}, ${detectorId}`);
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
      `Error Occurred while creating members in Delegator Account of GuardDuty ${error.code}: ${error.message}`,
    );
    throw error;
  }
}

// Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
async function updateConfig(detectorId: string, s3Protection: boolean, autoEnable = true) {
  try {
    console.log(`Calling api "guardduty.updateOrganizationConfiguration()", ${detectorId}`);
    await throttlingBackOff(() =>
      guardduty
        .updateOrganizationConfiguration({
          AutoEnable: autoEnable,
          DetectorId: detectorId,
          DataSources: {
            S3Logs: {
              AutoEnable: s3Protection,
            },
          },
        })
        .promise(),
    );
  } catch (error) {
    console.error(`Error Occurred while update config of GuardDuty ${error.code}: ${error.message}`);
    throw error;
  }
}

// describe-organization-configuration to check if security hub is already enabled in org level or not
async function isConfigurationAutoEnabled(detectorId: string, s3Protection: boolean): Promise<boolean> {
  try {
    console.log(`Calling api "guardduty.describeOrganizationConfiguration()", ${detectorId}`);
    const response = await throttlingBackOff(() =>
      guardduty
        .describeOrganizationConfiguration({
          DetectorId: detectorId,
        })
        .promise(),
    );
    return response.AutoEnable && response.DataSources?.S3Logs.AutoEnable! === s3Protection;
  } catch (error) {
    console.error(
      `Error Occurred while checking configuration auto enabled of GuardDuty ${error.code}: ${error.message}`,
    );
    throw error;
  }
}

async function updateMemberDataSource(memberAccounts: AccountDetail[], detectorId: string, s3Protection: boolean) {
  if (s3Protection) {
    return;
  }
  try {
    console.log(
      `Calling api "guardduty.updateMemberDetectors()", ${memberAccounts}, ${detectorId} to disable S3Protection`,
    );
    await throttlingBackOff(() =>
      guardduty
        .updateMemberDetectors({
          AccountIds: memberAccounts.map(acc => acc.AccountId),
          DetectorId: detectorId,
          DataSources: {
            S3Logs: {
              Enable: false,
            },
          },
        })
        .promise(),
    );
  } catch (error) {
    console.error(`Error Occurred while updateMemberDetectors of GuardDuty ${error.code}: ${error.message}`);
    throw error;
  }
}

async function updateS3Protection(detectorId: string, s3Protection: boolean) {
  try {
    await throttlingBackOff(() =>
      guardduty
        .updateDetector({
          DetectorId: detectorId,
          DataSources: {
            S3Logs: {
              Enable: s3Protection,
            },
          },
        })
        .promise(),
    );
  } catch (error) {
    console.warn('Error while calling guardduty.updateDetector');
    console.warn(error);
  }
}

async function deleteMembers(memberAccounts: AccountDetail[], detectorId: string) {
  try {
    console.log(`Calling api "guardduty.createMembers()", ${memberAccounts}, ${detectorId}`);
    await throttlingBackOff(() =>
      guardduty
        .deleteMembers({
          DetectorId: detectorId,
          AccountIds: memberAccounts.map(acc => acc.AccountId),
        })
        .promise(),
    );
  } catch (error) {
    console.error(
      `Error Occurred while creating members in Delegator Account of GuardDuty ${error.code}: ${error.message}`,
    );
    throw error;
  }
}

function getPropertiesFromEvent(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  if (typeof properties.s3Protection === 'string') {
    properties.s3Protection = properties.s3Protection === 'true';
  }
  return properties;
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log('Delete Action GuardDuty Admin Setup');
  if (event.PhysicalResourceId != physicalResourceId) {
    return;
  }
  const properties = getPropertiesFromEvent(event);
  const { memberAccounts } = properties;
  try {
    const detectorId = await getDetectorId();
    await updateS3Protection(detectorId!, false);
    await updateConfig(detectorId!, false, false);
    await updateMemberDataSource(memberAccounts, detectorId!, false);
    await deleteMembers(memberAccounts, detectorId!);
  } catch (error) {
    console.warn('Exception while performing Delete Action');
    console.warn(error);
  }
}
