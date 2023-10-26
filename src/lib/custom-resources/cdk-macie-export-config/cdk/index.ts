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
import { HandlerProperties } from '@aws-accelerator/custom-resource-macie-export-config-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::MacieExportConfig';

export interface MacieExportConfigProps {
  bucketName: string;
  kmsKeyArn: string;
  keyPrefix?: string;
  roleArn: string;
}
/**
 * Custom resource implementation that set Macie classification export config
 */
export class MacieExportConfig extends Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: Construct, id: string, props: MacieExportConfigProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = props;
    const exportConfig = this.lambdaFunction(props.roleArn);

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: exportConfig.functionArn,
      properties: handlerProperties,
    });
  }

  private lambdaFunction(roleArn: string): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-macie-export-config-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const role = iam.Role.fromRoleArn(stack, `${resourceType}Role`, roleArn);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(10),
    });
  }
}
