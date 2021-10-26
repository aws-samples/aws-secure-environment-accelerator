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
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as events from '@aws-cdk/aws-events';

const resourceType = 'Custom::CentralLoggingSubscriptionFilter';

export interface CentralLoggingSubscriptionFilterProps {
  logDestinationArn: string;
  globalExclusions?: string[];
  ruleName: string;
  logRetention: number;
  roleArn: string;
}

/**
 * Custom resource to create subscription filter in all existing log groups
 */
export class CentralLoggingSubscriptionFilter extends cdk.Construct {
  private readonly resource: cdk.CustomResource;
  private readonly role: iam.IRole;
  private readonly cloudWatchEnventLambdaPath =
    '@aws-accelerator/custom-resource-logs-add-subscription-filter-cloudwatch-event-runtime';
  private readonly cloudFormationCustomLambaPath =
    '@aws-accelerator/custom-resource-logs-add-subscription-filter-runtime';

  constructor(scope: cdk.Construct, id: string, props: CentralLoggingSubscriptionFilterProps) {
    super(scope, id);

    this.role = iam.Role.fromRoleArn(this, `${resourceType}Role`, props.roleArn);
    // Custom Resource to add subscriptin filter to existing logGroups
    this.resource = new cdk.CustomResource(this, 'CustomResource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...props,
      },
    });

    // Creating new CloudWatch event Rule which adds Subscription filter to newly created LogGroup
    const envVariables = {
      EXCLUSIONS: JSON.stringify(props.globalExclusions),
      LOG_DESTINATION: props.logDestinationArn,
      LOG_RETENTION: props.logRetention.toString(),
    };
    const addSubscriptionLambda = this.ensureLambdaFunction(
      this.cloudWatchEnventLambdaPath,
      `AddSubscriptionFilter`,
      envVariables,
    );
    const eventPattern = {
      source: ['aws.logs'],
      'detail-type': ['AWS API Call via CloudTrail'],
      detail: {
        eventSource: ['logs.amazonaws.com'],
        eventName: ['CreateLogGroup'],
      },
    };

    const ruleTarget: events.CfnRule.TargetProperty = {
      arn: addSubscriptionLambda.functionArn,
      id: 'AddSubscriptionFilterRule',
    };

    const addSubscriptionEvent = new events.CfnRule(this, 'NewLogGroupsCwlRule', {
      description: 'Adds CWL Central Logging Destination as Subscription filter to newly created Log Group',
      state: 'ENABLED',
      name: props.ruleName,
      eventPattern,
      targets: [ruleTarget],
    });

    // Adding permissions to invoke Lambda function from cloudwatch event
    addSubscriptionLambda.addPermission(`InvokePermission-NewLogGroup_rule`, {
      action: 'lambda:InvokeFunction',
      principal: new iam.ServicePrincipal('events.amazonaws.com'),
    });

    // Adding event as dependent to CWLAddSubscription Custom Resource to handle all cloudwatch log groups
    this.resource.node.addDependency(addSubscriptionEvent);
  }

  get lambdaFunction(): lambda.Function {
    return this.ensureLambdaFunction(this.cloudFormationCustomLambaPath, resourceType);
  }

  private ensureLambdaFunction(
    lambdaLocation: string,
    name: string,
    environment?: { [key: string]: string },
  ): lambda.Function {
    const constructName = `${name}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve(lambdaLocation);
    const lambdaDir = path.dirname(lambdaPath);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: this.role,
      environment: environment!,
      // Set timeout to maximum timeout
      timeout: cdk.Duration.minutes(15),
    });
  }
}
