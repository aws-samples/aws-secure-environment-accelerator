import * as AWS from 'aws-sdk';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';

const cloudTrail = new AWS.CloudTrail();

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
  console.log(`Creating CloudTrail ...`);
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
  try {
    // create CloudTrail Trail
    await cloudTrail
      .createTrail({
        Name: event.ResourceProperties.cloudTrailName,
        S3BucketName: event.ResourceProperties.bucketName,
        CloudWatchLogsLogGroupArn: event.ResourceProperties.logGroupArn,
        CloudWatchLogsRoleArn: event.ResourceProperties.roleArn,
        EnableLogFileValidation: true,
        IncludeGlobalServiceEvents: true,
        IsMultiRegionTrail: true,
        IsOrganizationTrail: true,
        KmsKeyId: event.ResourceProperties.kmsKeyId,
        S3KeyPrefix: event.ResourceProperties.s3KeyPrefix,
        TagsList: [
          {
            Key: event.ResourceProperties.tagName,
            Value: event.ResourceProperties.tagValue,
          },
        ],
      })
      .promise();

    // Log Insight events
    await cloudTrail
      .putInsightSelectors(buildInsightSelectorsRequest(event.ResourceProperties.cloudTrailName))
      .promise();

    // S3 Data events
    await cloudTrail.putEventSelectors(buildEventSelectorsRequest(event.ResourceProperties.cloudTrailName)).promise();

    // Enable CloudTrail Trail logging
    await cloudTrail
      .startLogging({
        Name: event.ResourceProperties.cloudTrailName,
      })
      .promise();
  } catch (e) {
    console.warn(`Ignore creation of CloudTrail Trail failure`);
    console.warn(e);
  }
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  try {
    const response = await cloudTrail
      .describeTrails({
        trailNameList: [event.ResourceProperties.cloudTrailName],
      })
      .promise();
    if (response.trailList?.length === 0) {
      return onCreate(event);
    }
  } catch (e) {
    console.warn(`describe CloudTrail Trail failure, calling create Trail`);
    console.warn(e);
  }
}

async function onDelete(event: CloudFormationCustomResourceEvent) {
  console.log(`Deleting CloudTrail Trail...`);
  try {
    await cloudTrail
      .deleteTrail({
        Name: event.ResourceProperties.cloudTrailName,
      })
      .promise();
  } catch (e) {
    console.warn(`Ignore deletion of CloudTrail Trail failure`);
    console.warn(e);
  }
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

function buildEventSelectorsRequest(trailName: string) {
  return {
    EventSelectors: [
      {
        DataResources: [
          {
            Type: 'AWS::S3::Object',
            Values: ['arn:aws:s3:::'],
          },
        ],
        ExcludeManagementEventSources: [],
        IncludeManagementEvents: true,
        ReadWriteType: 'All',
      },
    ],
    TrailName: trailName,
  };
}
