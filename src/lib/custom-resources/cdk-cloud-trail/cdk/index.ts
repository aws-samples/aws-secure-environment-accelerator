import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';

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
  managementEvents: boolean;
  s3Events: boolean;
}

/**
 * Custom resource implementation that creates CloudTrail
 */
export class CreateCloudTrail extends cdk.Construct {
  private readonly resource: cdk.CustomResource;
  constructor(scope: cdk.Construct, id: string, props: CloudTrailProperties) {
    super(scope, id);

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: props,
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-cloud-trail-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: this.role,
      timeout: cdk.Duration.minutes(15),
    });
  }

  private get role(): iam.Role {
    const constructName = `CreateCloudTrailRole`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as iam.Role;
    }
    const iamRole = new iam.Role(stack, constructName, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    iamRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );
    iamRole.addToPrincipalPolicy(
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
      }),
    );
    iamRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['iam:PassRole', 'iam:GetRole', 'iam:CreateServiceLinkedRole'],
        resources: ['*'],
      }),
    );
    iamRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['organizations:DescribeOrganization', 'organizations:ListAWSServiceAccessForOrganization'],
        resources: ['*'],
      }),
    );
    return iamRole;
  }
}
