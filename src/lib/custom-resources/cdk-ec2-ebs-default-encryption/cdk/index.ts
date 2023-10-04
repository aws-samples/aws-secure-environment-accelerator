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
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { HandlerProperties } from '@aws-accelerator/custom-resource-ec2-ebs-default-encryption-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::EBSDefaultEncryption';

export interface EbsDefaultEncryptionProps {
  key: kms.IKey;
}

export class EbsDefaultEncryption extends Construct {
  constructor(scope: Construct, id: string, private readonly props: EbsDefaultEncryptionProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      KmsKeyId: props.key.keyId,
    };

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-ec2-ebs-default-encryption-runtime');
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
          'ec2:GetEbsDefaultKmsKeyId',
          'ec2:GetEbsEncryptionByDefault',
          'ec2:DisableEbsEncryptionByDefault',
          'ec2:EnableEbsEncryptionByDefault',
          'ec2:ModifyEbsDefaultKmsKeyId',
          'ec2:ResetEbsDefaultKmsKeyId',
        ],
        resources: ['*'],
      }),
    );

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['kms:DescribeKey'],
        resources: [this.props.key.keyArn],
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
}
