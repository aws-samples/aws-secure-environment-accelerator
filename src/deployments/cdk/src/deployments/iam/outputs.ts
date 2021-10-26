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

import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { createFixedSecretName } from '@aws-accelerator/common-outputs/src/secrets';

import { createCfnStructuredOutput } from '../../common/structured-output';
import { IamRoleOutput, IamPolicyOutput } from '@aws-accelerator/common-outputs/src/iam-role';
import { IamUserOutput, IamGroupOutput } from '@aws-accelerator/common-outputs/src/iam-users';
import { AccountStack } from '../../common/account-stacks';

export const CfnIamRoleOutput = createCfnStructuredOutput(IamRoleOutput);

export const CfnIamPolicyOutput = createCfnStructuredOutput(IamPolicyOutput);

export const CfnIamUserOutput = createCfnStructuredOutput(IamUserOutput);

export const CfnIamGroupOutput = createCfnStructuredOutput(IamGroupOutput);

export function createIamUserPasswordSecretName({
  acceleratorPrefix,
  accountKey,
  userId,
}: {
  acceleratorPrefix: string;
  accountKey: string;
  userId: string;
}) {
  return createFixedSecretName({
    acceleratorPrefix,
    parts: [accountKey, 'user', 'password', userId],
  });
}

export function getIamUserPasswordSecretValue({
  acceleratorPrefix,
  accountKey,
  userId,
  secretAccountId,
}: {
  acceleratorPrefix: string;
  accountKey: string;
  userId: string;
  secretAccountId: string;
}) {
  const secretName = createIamUserPasswordSecretName({
    acceleratorPrefix,
    accountKey,
    userId,
  });
  return cdk.SecretValue.secretsManager(
    `arn:${cdk.Aws.PARTITION}:secretsmanager:${cdk.Aws.REGION}:${secretAccountId}:secret:${secretName}`,
  );
}

export function createIamRoleOutput(stack: AccountStack, role: iam.IRole, outputName: string) {
  new CfnIamRoleOutput(stack, `${outputName}Output`, {
    roleName: role.roleName,
    roleArn: role.roleArn,
    roleKey: outputName,
  });
}
