import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';

const resourceType = 'Custom::CreateCloudTrail';

export interface CloudTrailProperties {
  cloudTrailName: string;
  bucketName: string;
  logGroupArn: string;
  roleArn: string;
  kmsKeyId: string;
  s3KeyPrefix: string;
  tagName: string;
  tagValue: string;
}

/**
 * Custom resource implementation that creates CloudTrail
 */
export class CreateCloudTrail extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: CloudTrailProperties) {
    super(scope, id);

    const { cloudTrailName, bucketName, logGroupArn, roleArn, kmsKeyId, s3KeyPrefix, tagName, tagValue } = props;

    const lambdaPath = require.resolve('@custom-resources/create-cloud-trail-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: [
            'cloudtrail:CreateTrail',
            'cloudtrail:UpdateTrail',
            'cloudtrail:DeleteTrail',
            'cloudtrail:DescribeTrails',
            'cloudtrail:AddTags',
            'cloudtrail:PutInsightSelectors',
            'cloudtrail:PutEventSelectors',
            'cloudtrail:StartLogging',
          ],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['iam:PassRole', 'iam:GetRole', 'iam:CreateServiceLinkedRole'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['organizations:DescribeOrganization', 'organizations:ListAWSServiceAccessForOrganization'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: {
        cloudTrailName,
        bucketName,
        logGroupArn,
        roleArn,
        kmsKeyId,
        s3KeyPrefix,
        tagName,
        tagValue,
      },
    });
  }
}
