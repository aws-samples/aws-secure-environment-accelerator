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

const resourceType = 'Custom::IAMPasswordPolicy';

export interface PasswordPolicyProperties {
  allowUsersToChangePassword: boolean;
  hardExpiry: boolean;
  requireUppercaseCharacters: boolean;
  requireLowercaseCharacters: boolean;
  requireSymbols: boolean;
  requireNumbers: boolean;
  minimumPasswordLength: number;
  passwordReusePrevention: number;
  maxPasswordAge: number;
}

/**
 * Custom resource implementation that set/update IAM account password policy
 */
export class IamPasswordPolicy extends Construct {
  constructor(scope: Construct, id: string, props: PasswordPolicyProperties) {
    super(scope, id);

    const {
      allowUsersToChangePassword,
      hardExpiry,
      requireUppercaseCharacters,
      requireLowercaseCharacters,
      requireSymbols,
      requireNumbers,
      minimumPasswordLength,
      passwordReusePrevention,
      maxPasswordAge,
    } = props;

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-iam-password-policy-runtime');
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
          actions: ['iam:UpdateAccountPasswordPolicy'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: {
        allowUsersToChangePassword,
        hardExpiry,
        requireUppercaseCharacters,
        requireLowercaseCharacters,
        requireSymbols,
        requireNumbers,
        minimumPasswordLength,
        passwordReusePrevention,
        maxPasswordAge,
      },
    });
  }
}
