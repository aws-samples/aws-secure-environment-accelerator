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
import { HandlerProperties } from '@aws-accelerator/custom-resource-ec2-keypair-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::EC2Keypair';

export interface KeypairProps {
  name: string;
  secretPrefix: string;
  roleName?: string;
}

export class Keypair extends Construct implements cdk.ITaggable {
  tags: cdk.TagManager = new cdk.TagManager(cdk.TagType.KEY_VALUE, 'Keypair');

  private resource: cdk.CustomResource;

  constructor(scope: Construct, id: string, private readonly props: KeypairProps) {
    super(scope, id);

    this.tags.setTag('Name', props.name);

    const handlerProperties: HandlerProperties = {
      keyName: this.props.name,
      secretPrefix: this.props.secretPrefix,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
    });
  }

  get keyName(): string {
    return this.resource.getAttString('KeyName');
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-ec2-keypair-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
      roleName: this.props.roleName,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['cur:*', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['ec2:CreateKeyPair', 'ec2:DeleteKeyPair'],
        resources: ['*'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'secretsmanager:CreateSecret',
          'secretsmanager:RestoreSecret',
          'secretsmanager:PutSecretValue',
          'secretsmanager:DeleteSecret',
        ],
        resources: ['*'],
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
