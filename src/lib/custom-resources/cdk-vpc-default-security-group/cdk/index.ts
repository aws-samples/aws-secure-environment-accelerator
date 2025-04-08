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
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { Construct } from 'constructs';

const resourceType = 'Custom::VpcDefaultSecurityGroup1';

export interface VpcDefaultSecurityGroupProps {
  vpcId: string;
  acceleratorName: string;
}

/**
 * Custom resource implementation that delete inbound and outbound rules of default security group
 */
export class VpcDefaultSecurityGroup extends Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: Construct, id: string, props: VpcDefaultSecurityGroupProps) {
    super(scope, id);

    this.resource = new cdk.CustomResource(this, 'Resource1', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        vpcId: props.vpcId,
        acceleratorName: props.acceleratorName,
      },
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-vpc-default-security-group-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:DescribeSecurityGroups',
          'ec2:RevokeSecurityGroupIngress',
          'ec2:RevokeSecurityGroupEgress',
          'ec2:CreateTags',
        ],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_LATEST,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(15),
    });
  }
}
