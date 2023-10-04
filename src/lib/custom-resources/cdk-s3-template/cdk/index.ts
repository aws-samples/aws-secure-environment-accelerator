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
import { HandlerProperties } from '@aws-accelerator/custom-resource-s3-template-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::S3Template';

export interface S3TemplateProps {
  templateBucket: s3.IBucket;
  templatePath: string;
  outputBucket: s3.IBucket;
  outputPath: string;
}

/**
 * Custom resource that has an VPN tunnel options attribute for the VPN connection with the given ID.
 */
export class S3Template extends Construct {
  private readonly handlerProperties: HandlerProperties;

  constructor(scope: Construct, id: string, props: S3TemplateProps) {
    super(scope, id);

    this.handlerProperties = {
      templateBucketName: props.templateBucket.bucketName,
      templatePath: props.templatePath,
      outputBucketName: props.outputBucket.bucketName,
      outputPath: props.outputPath,
      parameters: {},
    };

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...this.handlerProperties,
        // Add a dummy value that is a random number to update the resource every time
        forceUpdate: Math.round(Math.random() * 1000000),
      },
    });

    props.templateBucket.grantRead(this.role);
    props.outputBucket.grantWrite(this.role);
  }

  addReplacement(key: string, value: string) {
    this.handlerProperties.parameters[key] = value;
  }

  get replacements() {
    return this.handlerProperties.parameters;
  }

  get lambdaFunction(): lambda.Function {
    return this.ensureLambdaFunction();
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  private ensureLambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-s3-template-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
    });
  }
}
