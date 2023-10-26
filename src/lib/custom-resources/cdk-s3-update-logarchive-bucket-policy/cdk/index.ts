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

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { HandlerProperties } from '@aws-accelerator/custom-resource-s3-update-logarchive-policy-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::S3UpdateLogArchivePolicy';

export interface LogArchiveReadAccessProps {
  roles: string[];
  logBucket: s3.IBucket;
  aesLogBucket: s3.IBucket;
  removalPolicy?: cdk.RemovalPolicy;
  acceleratorPrefix: string;
  forceUpdate?: boolean;
}

/**
 * Adds IAM roles with {'ssm-log-archive-read-only-access': true} to the LogArchive bucket policy
 */
export class S3UpdateLogArchivePolicy extends Construct {
  private resource: cdk.CustomResource | undefined;

  constructor(scope: Construct, id: string, private readonly props: LogArchiveReadAccessProps) {
    super(scope, id);

    const { roles, logBucket, aesLogBucket, acceleratorPrefix } = props;
    const handlerProperties: HandlerProperties = {
      roles: this.props.roles,
      logBucketArn: this.props.logBucket.bucketArn,
      logBucketName: this.props.logBucket.bucketName,
      logBucketKmsKeyArn: this.props.logBucket.encryptionKey?.keyArn,
      aesLogBucketArn: this.props.aesLogBucket.bucketArn,
      aesLogBucketName: this.props.aesLogBucket.bucketName,
    };

    const forceUpdate = this.props.forceUpdate ?? true;
    if (forceUpdate) {
      // Add a dummy value that is a random number to update the resource every time
      handlerProperties.forceUpdate = Math.round(Math.random() * 1000000);
    }

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      removalPolicy: this.props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
      properties: handlerProperties,
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-s3-update-logarchive-policy-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, 'Role', {
      roleName: `${this.props.acceleratorPrefix}S3UpdateLogArchivePolicy`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetBucketPolicy',
          's3:PutBucketPolicy',
          'kms:GetKeyPolicy',
          'kms:PutKeyPolicy',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'tag:GetResources',
        ],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.seconds(60),
    });
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }
}
