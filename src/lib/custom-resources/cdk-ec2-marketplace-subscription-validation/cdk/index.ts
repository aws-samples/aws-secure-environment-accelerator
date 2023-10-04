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
import { HandlerProperties } from '@aws-accelerator/custom-resource-ec2-marketplace-subscription-validation-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::MarketPlaceSubscriptionCheck';

export interface Ec2MarketPlaceSubscriptionCheckProps {
  imageId: string;
  subnetId: string;
  instanceType?: string;
}

export type Attribute = 'Status';

/**
 * Custom resource that has an image ID attribute for the image with the given properties.
 */
export class Ec2MarketPlaceSubscriptionCheck extends Construct {
  private readonly resource: cdk.CustomResource;
  constructor(scope: Construct, id: string, props: Ec2MarketPlaceSubscriptionCheckProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      imageId: props.imageId,
      subnetId: props.subnetId,
      instanceType: props.instanceType,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...handlerProperties,
        // Add a dummy value that is a random number to update the resource every time
        forceUpdate: Math.round(Math.random() * 1000000),
      },
    });
  }

  /**
   * Returns the given CloudFormation attribute.
   */
  get status(): string {
    return this.resource.getAttString('Status');
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

    const lambdaPath = require.resolve(
      '@aws-accelerator/custom-resource-ec2-marketplace-subscription-validation-runtime',
    );
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'ec2:RunInstances'],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      // Set timeout to maximum timeout
      timeout: cdk.Duration.minutes(15),
    });
  }
}
