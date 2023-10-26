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
import { Construct } from 'constructs';

const resourceType = 'Custom::EC2LaunchTime';

export interface InstanceLaunchTimeProps {
  instanceId: string;
}

/**
 * Custom resource implementation that get EC2 instance status.
 */
export class InstanceLaunchTime extends Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: Construct, id: string, props: InstanceLaunchTimeProps) {
    super(scope, id);

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-ec2-launch-time-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_18_X,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['ec2:DescribeInstances'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: {
        InstanceId: props.instanceId,
      },
    });
  }

  get launchTime(): string {
    return this.resource.getAttString('LaunchTime');
  }
}
