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
AWS.config.logger = console;
import { CloudFormationCustomResourceDeleteEvent, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';
import { errorHandler } from '@aws-accelerator/custom-resource-runtime-cfn-response';

export interface HandlerProperties {
  cloudTrailName: string;
  bucketName: string;
  logGroupArn: string;
  roleArn: string;
  kmsKeyId: string;
  s3KeyPrefix: string;
  tagName: string;
  tagValue: string;
  managementEvents: boolean;
  s3Events: boolean;
}

const cloudTrail = new AWS.CloudTrail();

export const handler = errorHandler(onEvent);

async function onEvent(event: CloudFormationCustomResourceEvent) {
  console.log(`Creating CloudTrail ...`);
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
  const properties = getPropertiesFromEvent(event);
  const {
    managementEvents,
    bucketName,
    cloudTrailName,
    kmsKeyId,
    logGroupArn,
    roleArn,
    s3Events,
    s3KeyPrefix,
    tagName,
    tagValue,
  } = properties;
  const response = await throttlingBackOff(() =>
    cloudTrail
      .describeTrails({
        trailNameList: [cloudTrailName],
      })
      .promise(),
  );
  if (response.trailList?.length === 0) {
    try {
      // create CloudTrail Trail
      await throttlingBackOff(() =>
        cloudTrail
          .createTrail(
            buildCloudTrailCreateRequest({
              name: cloudTrailName,
              bucketName,
              logGroupArn,
              roleArn,
              kmsKeyId,
              s3KeyPrefix,
              tagName,
              tagValue,
            }),
          )
          .promise(),
      );
    } catch (e) {
      throw new Error(`Cannot create CloudTrail Trail: ${JSON.stringify(e)}`);
    }
  } else {
    try {
      // update CloudTrail Trail
      await cloudTrail
        .updateTrail(
          buildCloudTrailUpdateRequest({
            name: cloudTrailName,
            bucketName,
            logGroupArn,
            roleArn,
            kmsKeyId,
            s3KeyPrefix,
          }),
        )
        .promise();
    } catch (e) {
      throw new Error(`Cannot update CloudTrail Trail: ${JSON.stringify(e)}`);
    }
  }

  // Log Insight events
  await throttlingBackOff(() => cloudTrail.putInsightSelectors(buildInsightSelectorsRequest(cloudTrailName)).promise());

  // S3 Data events
  await throttlingBackOff(() =>
    cloudTrail.putEventSelectors(buildEventSelectorsRequest(cloudTrailName, !!managementEvents, !!s3Events)).promise(),
  );

  // Enable CloudTrail Trail logging
  await throttlingBackOff(() =>
    cloudTrail
      .startLogging({
        Name: cloudTrailName,
      })
      .promise(),
  );

  return {
    physicalResourceId: `OrgCloudTrail-${cloudTrailName}`,
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(event: CloudFormationCustomResourceDeleteEvent) {
  console.log(`Deleting CloudTrail ...`);
  console.log(JSON.stringify(event, null, 2));
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  const { cloudTrailName } = properties;
  if (event.PhysicalResourceId !== `OrgCloudTrail-${cloudTrailName}`) {
    return;
  }

  // Delete CloudTrail Trail
  await throttlingBackOff(() =>
    cloudTrail
      .deleteTrail({
        Name: cloudTrailName,
      })
      .promise(),
  );
}

function buildInsightSelectorsRequest(trailName: string) {
  return {
    InsightSelectors: [
      {
        InsightType: 'ApiCallRateInsight',
      },
    ],
    TrailName: trailName,
  };
}

function buildEventSelectorsRequest(trailName: string, managementEvents: boolean, s3DataSource: boolean) {
  const dataSources: AWS.CloudTrail.DataResource[] = [];
  if (s3DataSource) {
    dataSources.push({
      Type: 'AWS::S3::Object',
      Values: ['arn:aws:s3:::'],
    });
  }
  return {
    EventSelectors: [
      {
        DataResources: dataSources,
        ExcludeManagementEventSources: [],
        IncludeManagementEvents: managementEvents,
        ReadWriteType: 'All',
      },
    ],
    TrailName: trailName,
  };
}

function buildCloudTrailCreateRequest(props: {
  name: string;
  bucketName: string;
  logGroupArn: string;
  roleArn: string;
  kmsKeyId: string;
  s3KeyPrefix: string;
  tagName: string;
  tagValue: string;
}): AWS.CloudTrail.CreateTrailRequest {
  const { name, bucketName, logGroupArn, roleArn, kmsKeyId, s3KeyPrefix, tagName, tagValue } = props;
  return {
    Name: name,
    S3BucketName: bucketName,
    CloudWatchLogsLogGroupArn: logGroupArn,
    CloudWatchLogsRoleArn: roleArn,
    EnableLogFileValidation: true,
    IncludeGlobalServiceEvents: true,
    IsMultiRegionTrail: true,
    IsOrganizationTrail: true,
    KmsKeyId: kmsKeyId,
    S3KeyPrefix: s3KeyPrefix,
    TagsList: [
      {
        Key: tagName,
        Value: tagValue,
      },
    ],
  };
}

function buildCloudTrailUpdateRequest(props: {
  name: string;
  bucketName: string;
  logGroupArn: string;
  roleArn: string;
  kmsKeyId: string;
  s3KeyPrefix: string;
}): AWS.CloudTrail.UpdateTrailRequest {
  const { name, bucketName, logGroupArn, roleArn, kmsKeyId, s3KeyPrefix } = props;
  return {
    Name: name,
    S3BucketName: bucketName,
    CloudWatchLogsLogGroupArn: logGroupArn,
    CloudWatchLogsRoleArn: roleArn,
    EnableLogFileValidation: true,
    IncludeGlobalServiceEvents: true,
    IsMultiRegionTrail: true,
    IsOrganizationTrail: true,
    KmsKeyId: kmsKeyId,
    S3KeyPrefix: s3KeyPrefix,
  };
}

function getPropertiesFromEvent(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;
  if (typeof properties.managementEvents === 'string') {
    properties.managementEvents = properties.managementEvents === 'true';
  }
  if (typeof properties.s3Events === 'string') {
    properties.s3Events = properties.s3Events === 'true';
  }
  return properties;
}
