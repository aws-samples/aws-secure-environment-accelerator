import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

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
  const response = await throttlingBackOff(() =>
    cloudTrail
      .describeTrails({
        trailNameList: [event.ResourceProperties.cloudTrailName],
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
              name: event.ResourceProperties.cloudTrailName,
              bucketName: event.ResourceProperties.bucketName,
              logGroupArn: event.ResourceProperties.logGroupArn,
              roleArn: event.ResourceProperties.roleArn,
              kmsKeyId: event.ResourceProperties.kmsKeyId,
              s3KeyPrefix: event.ResourceProperties.s3KeyPrefix,
              tagName: event.ResourceProperties.tagName,
              tagValue: event.ResourceProperties.tagValue,
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
            name: event.ResourceProperties.cloudTrailName,
            bucketName: event.ResourceProperties.bucketName,
            logGroupArn: event.ResourceProperties.logGroupArn,
            roleArn: event.ResourceProperties.roleArn,
            kmsKeyId: event.ResourceProperties.kmsKeyId,
            s3KeyPrefix: event.ResourceProperties.s3KeyPrefix,
          }),
        )
        .promise();
    } catch (e) {
      throw new Error(`Cannot update CloudTrail Trail: ${JSON.stringify(e)}`);
    }
  }

  // Log Insight events
  await throttlingBackOff(() =>
    cloudTrail.putInsightSelectors(buildInsightSelectorsRequest(event.ResourceProperties.cloudTrailName)).promise(),
  );

  // S3 Data events
  await throttlingBackOff(() =>
    cloudTrail.putEventSelectors(buildEventSelectorsRequest(event.ResourceProperties.cloudTrailName)).promise(),
  );

  // Enable CloudTrail Trail logging
  await throttlingBackOff(() =>
    cloudTrail
      .startLogging({
        Name: event.ResourceProperties.cloudTrailName,
      })
      .promise(),
  );
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(event: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
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
