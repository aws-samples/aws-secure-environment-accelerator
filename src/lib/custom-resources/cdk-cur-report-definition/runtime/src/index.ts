import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export type HandlerProperties = AWS.CUR.ReportDefinition;

export const handler = errorHandler(onEvent);

const cur = new AWS.CUR({
  // CUR is only reachable through us-east-1
  region: 'us-east-1',
});

async function onEvent(event: CloudFormationCustomResourceEvent) {
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
  console.log(`Creating report definition...`);
  console.log(JSON.stringify(event, null, 2));

  const response = await createOrUpdateReportDefinition(event);
  return {
    physicalResourceId: response,
    data: {
      ReportName: response,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  console.log(`Updating report definition...`);
  console.log(JSON.stringify(event, null, 2));

  const response = await createOrUpdateReportDefinition(event);
  return {
    physicalResourceId: response,
    data: {
      ReportName: response,
    },
  };
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting report definition...`);
  console.log(JSON.stringify(event, null, 2));

  try {
    await throttlingBackOff(() =>
      cur
        .deleteReportDefinition({
          ReportName: event.PhysicalResourceId,
        })
        .promise(),
    );
  } catch (e) {
    console.warn(`Ignore report definition delete failure`);
    console.warn(e);
  }
}

async function createOrUpdateReportDefinition(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  // Sometimes the RefreshClosedReports value is passed as a string
  if (typeof properties.RefreshClosedReports === 'string') {
    properties.RefreshClosedReports = properties.RefreshClosedReports === 'true';
  }

  // Recreate the report definition to avoid sending additional properties
  const reportDefinition = {
    ReportName: properties.ReportName,
    TimeUnit: properties.TimeUnit,
    Format: properties.Format,
    Compression: properties.Compression,
    AdditionalSchemaElements: properties.AdditionalSchemaElements,
    S3Bucket: properties.S3Bucket,
    S3Prefix: properties.S3Prefix,
    S3Region: properties.S3Region,
    AdditionalArtifacts: properties.AdditionalArtifacts,
    RefreshClosedReports: properties.RefreshClosedReports,
    ReportVersioning: properties.ReportVersioning,
  };

  try {
    await throttlingBackOff(() =>
      cur
        .putReportDefinition({
          ReportDefinition: reportDefinition,
        })
        .promise(),
    );
  } catch (e) {
    if (e.code === 'DuplicateReportNameException') {
      console.log(`Report already exists. Modifying the existing report`);

      await throttlingBackOff(() =>
        cur
          .modifyReportDefinition({
            ReportName: reportDefinition.ReportName,
            ReportDefinition: reportDefinition,
          })
          .promise(),
      );
    } else {
      throw e;
    }
  }
  return properties.ReportName;
}
