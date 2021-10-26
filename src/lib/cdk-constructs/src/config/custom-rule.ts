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
import * as cdk from '@aws-cdk/core';
import * as config from '@aws-cdk/aws-config';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

export interface CustomRuleProps extends Omit<config.CustomRuleProps, 'lambdaFunction'> {
  roleArn: string;
  lambdaRuntime: string;
  runtimeFileLocation: string;
}

export class CustomRule extends cdk.Construct {
  private readonly constructName: string;
  private role: iam.IRole;
  private runtimeFileLocation: string;
  private lambdaRuntime: string;
  resource: config.CustomRule;
  constructor(scope: cdk.Construct, name: string, props: CustomRuleProps) {
    super(scope, name);
    this.constructName = `${name}Lambda`;
    this.role = iam.Role.fromRoleArn(this, `${name}Role`, props.roleArn);
    this.runtimeFileLocation = props.runtimeFileLocation.endsWith('.zip')
      ? props.runtimeFileLocation
      : props.runtimeFileLocation + '.zip';
    this.lambdaRuntime = props.lambdaRuntime;
    this.resource = new config.CustomRule(this, 'Resource', {
      lambdaFunction: this.ensureLambda(),
      ...props,
    });
  }

  private ensureLambda(): lambda.Function {
    const constructName = this.constructName;

    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaFunction = new lambda.Function(this, 'Lambda', {
      runtime: new lambda.Runtime(this.lambdaRuntime),
      code: lambda.Code.fromAsset(this.runtimeFileLocation),
      handler: 'index.handler',
      role: this.role,
    });

    return lambdaFunction;
  }
}
