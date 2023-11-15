/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as AWS from 'aws-sdk';
import { CostAndUsageReportService, ReportDefinition } from '@aws-sdk/client-cost-and-usage-report-service';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceDeleteEvent } from 'aws-lambda';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

export type HandlerProperties = ReportDefinition;

export const handler = errorHandler(onEvent);

const cur = new CostAndUsageReportService({
  // CUR is only reachable through us-east-1
  region: 'us-east-1',

  logger: console,
});

async function onEvent(event: CloudFormationCustomResourceEvent) {
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
        }),
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
        }),
    );
  } catch (e: any) {
    if (e.code === 'DuplicateReportNameException') {
      console.log(`Report already exists. Modifying the existing report`);

      await throttlingBackOff(() =>
        cur
          .modifyReportDefinition({
            ReportName: reportDefinition.ReportName,
            ReportDefinition: reportDefinition,
          }),
      );
    } else {
      throw e;
    }
  }
  return properties.ReportName;
}
