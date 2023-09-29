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
import { HandlerProperties } from '@aws-accelerator/custom-resource-logs-log-group-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::LogsLogGroup';

export type LogGroupRetention =
  | 1
  | 3
  | 5
  | 7
  | 14
  | 30
  | 60
  | 90
  | 120
  | 150
  | 180
  | 365
  | 400
  | 545
  | 731
  | 1827
  | 3653;

export interface LogGroupProps {
  /**
   * Name of the log group.
   */
  readonly logGroupName: string;
  /**
   * How long, in days, the log contents will be retained.
   *
   * To retain all logs, set this value to undefined.
   *
   * @default undefined
   */
  readonly retention?: LogGroupRetention;
  /**
   * Determine the removal policy of this log group.
   *
   * Normally you want to retain the log group so you can diagnose issues
   * from logs even after a deployment that no longer includes the log group.
   * In that case, use the normal date-based retention policy to age out your
   * logs.
   *
   * @default RemovalPolicy.Retain
   */
  readonly removalPolicy?: cdk.RemovalPolicy;
  readonly roleName?: string;
  readonly roleArn: string;
  /**
   * KMS Key used for encryption
   */
  readonly kmsKeyId?: string;
}

export class LogGroup extends Construct implements cdk.ITaggable {
  tags: cdk.TagManager = new cdk.TagManager(cdk.TagType.MAP, 'LogGroup');

  private resource: cdk.CustomResource | undefined;
  private roleArn: string;

  constructor(scope: Construct, id: string, private readonly props: LogGroupProps) {
    super(scope, id);
    this.roleArn = props.roleArn;
    const handlerProperties: HandlerProperties = {
      logGroupName: this.props.logGroupName,
      retention: this.props?.retention,
      tags: this.tags.renderTags(),
      kmsKeyId: this.props.kmsKeyId,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
      removalPolicy: this.props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
    });
  }

  get logGroupName() {
    return cdk.Lazy.string({
      produce: () => this.resource!.getAttString('LogGroupName'),
    });
  }

  get logGroupArn() {
    return `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${this.logGroupName}:*`;
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-logs-log-group-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const role = iam.Role.fromRoleArn(stack, `${resourceType}Role`, this.roleArn);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(15),
    });
  }
}
