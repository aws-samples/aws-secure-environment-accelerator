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
import { HandlerProperties } from '@aws-accelerator/custom-resource-cfn-sleep-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::Sleep';

export interface CfnSleepProps {
  sleep: number;
}

/**
 * Custom resource that has an image ID attribute for the image with the given properties.
 */
export class CfnSleep extends Construct {
  constructor(scope: Construct, id: string, props: CfnSleepProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      sleep: props.sleep,
    };

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
    });
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-cfn-sleep-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: this.ensureRole(),
      // Set timeout to maximum timeout
      timeout: cdk.Duration.minutes(15),
    });
  }

  private ensureRole(): iam.Role {
    const roleConstructName = `${resourceType}Role`;
    const stack = cdk.Stack.of(this);
    const existingRole = stack.node.tryFindChild(roleConstructName);
    if (existingRole) {
      return existingRole as iam.Role;
    }
    const role = new iam.Role(stack, roleConstructName, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );
    return role;
  }
}
