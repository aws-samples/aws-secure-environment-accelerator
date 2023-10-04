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

const resourceType = 'Custom::TGWAcceptPeeringAttachment';

export interface TransitGatewayAcceptPeeringAttachmentProps {
  transitGatewayAttachmentId: string;
  tagValue: string;
  roleArn: string;
}

/**
 * Custom resource implementation that accepts transit gateway peering attachment
 */
export class TransitGatewayAcceptPeeringAttachment extends Construct {
  private readonly resource: cdk.CustomResource;
  private readonly role: iam.IRole;

  constructor(scope: Construct, id: string, props: TransitGatewayAcceptPeeringAttachmentProps) {
    super(scope, id);

    this.role = iam.Role.fromRoleArn(scope, `${resourceType}Role`, props.roleArn);

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        attachmentId: props.transitGatewayAttachmentId,
        tagValue: props.tagValue,
      },
    });
  }

  get lambdaFunction(): lambda.Function {
    return this.ensureLambdaFunction();
  }

  private ensureLambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-accept-tgw-peering-attachment-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: this.role,
      timeout: cdk.Duration.minutes(10),
    });
  }
}
