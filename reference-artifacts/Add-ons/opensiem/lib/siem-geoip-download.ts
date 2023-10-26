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

import { CustomResource, Stack, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

const resourceType = 'Custom::OpenSearchSiemGeoIpInit';

export interface OpenSearchSiemGeoIpInitProps {
  geoIpLambdaRoleArn: string;
  siemVersion: string;
}

/**
 * Custom resource that will configure S3 Bucket Notifications
 */
export class OpenSearchSiemGeoIpInit extends Construct {
  private readonly resource: CustomResource;

  constructor(scope: Construct, id: string, private readonly props: OpenSearchSiemGeoIpInitProps) {
    super(scope, id);

    this.resource = new CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...props,
      },
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

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
        actions: ['lambda:InvokeFunction'],
        resources: [this.props.geoIpLambdaRoleArn],
      }),
    );

    return new lambda.Function(stack, `GeoIpInitLambda`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('lambdas/siem-geoip/dist'),
      role,
      handler: 'index.geoIpInit',
      timeout: Duration.minutes(5),
      memorySize: 2048,
      environment: {
        SIEM_VERSION: this.props.siemVersion,
      },
    });
  }
}
