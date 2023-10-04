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

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

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
export class CreateCloudTrail extends Construct {
  private readonly resource: cdk.CustomResource;
  constructor(scope: Construct, id: string, props: CloudTrailProperties) {
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
      runtime: lambda.Runtime.NODEJS_18_X,
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
