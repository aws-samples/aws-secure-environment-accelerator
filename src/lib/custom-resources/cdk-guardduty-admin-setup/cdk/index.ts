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
import { GuardDutyFrequency } from '@aws-accelerator/custom-resource-guardduty-admin-setup-runtime';
import { Construct } from 'constructs';

const resourceType = 'Custom::GuardDutyAdminSetup';

export interface AccountDetail {
  AccountId: string;
  Email: string;
}

export interface GuardDutyAdminSetupProps {
  memberAccounts: AccountDetail[];
  roleArn: string;
  s3Protection: boolean;
  eksProtection: boolean;
  frequency: GuardDutyFrequency;
}

/**
 * Custom resource implementation that does initial admin account setup for Guard Duty
 * Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 * Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 */
export class GuardDutyAdminSetup extends Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: Construct, id: string, props: GuardDutyAdminSetupProps) {
    super(scope, id);

    const handlerProperties = {
      memberAccounts: props.memberAccounts,
      s3Protection: props.s3Protection,
      eksProtection: props.eksProtection,
      frequency: props.frequency,
    };

    const adminSetup = this.lambdaFunction(props.roleArn);
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: adminSetup.functionArn,
      properties: {
        ...handlerProperties,
        // Add a dummy value that is a random number to update the resource every time
        forceUpdate: Math.round(Math.random() * 1000000),
      },
    });
  }

  private lambdaFunction(roleArn: string): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-guardduty-admin-setup-runtime');
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
