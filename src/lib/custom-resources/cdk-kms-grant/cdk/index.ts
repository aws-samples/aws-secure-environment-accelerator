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
import { HandlerProperties } from '@aws-accelerator/custom-resource-kms-grant-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::KMSGrant';

export enum GrantOperation {
  DECRYPT = 'Decrypt',
  ENCRYPT = 'Encrypt',
  GENERATE_DATA_KEY = 'GenerateDataKey',
  GENERATE_DATA_KEY_WITHOUT_PLAINTEXT = 'GenerateDataKeyWithoutPlaintext',
  RE_ENCRYPT_FROM = 'ReEncryptFrom',
  RE_ENCRYPT_TO = 'ReEncryptTo',
  SIGN = 'Sign',
  VERIFY = 'Verify',
  GET_PUBLIC_KEY = 'GetPublicKey',
  CREATE_GRANT = 'CreateGrant',
  RETIRE_GRANT = 'RetireGrant',
  DESCRIBE_KEY = 'DescribeKey',
  GENERATE_DATA_KEY_PAIR = 'GenerateDataKeyPair',
  GENERATE_DATA_KEY_PAIR_WITHOUT_PLAINTEXT = 'GenerateDataKeyPairWithoutPlaintext',
}

export interface GrantProps {
  name?: string;
  key: kms.IKey;
  granteePrincipal: iam.ArnPrincipal;
  retiringPrincipal?: iam.ArnPrincipal;
  operations: GrantOperation[];
  constraints?: AWS.KMS.GrantConstraints;
  tokens?: string[];
  roleName?: string;
}

export class Grant extends Construct {
  private resource: cdk.CustomResource;

  constructor(scope: Construct, id: string, private readonly props: GrantProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      Name: props.name,
      KeyId: props.key.keyId,
      GranteePrincipal: props.granteePrincipal.arn,
      RetiringPrincipal: props.retiringPrincipal?.arn,
      Operations: props.operations,
      Constraints: props.constraints,
      GrantTokens: props.tokens,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
    });
  }

  get grantId(): string {
    return this.resource.getAttString('GrantId');
  }

  get grantToken(): string {
    return this.resource.getAttString('GrantToken');
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-kms-grant-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
      roleName: this.props.roleName,
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
        actions: ['kms:CreateGrant', 'kms:RevokeGrant'],
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
