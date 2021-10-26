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
import * as t from 'io-ts';
import { createMadPasswordSecretName, createMadUserPasswordSecretName } from '@aws-accelerator/common-outputs/src/mad';
import { createCfnStructuredOutput } from '../../common/structured-output';
export { createMadPasswordSecretName, createMadUserPasswordSecretName } from '@aws-accelerator/common-outputs/src/mad';
import { ImageIdOutput } from '@aws-accelerator/common-outputs/src/ami-output';
import { DynamicSecretOutput } from '@aws-accelerator/common-outputs/src/secrets';

export const CfnDynamicSecretOutput = createCfnStructuredOutput(DynamicSecretOutput);

export const MadAutoScalingRoleOutputType = t.interface(
  {
    roleArn: t.string,
  },
  'MadAutoScalingRole',
);

export type MadAutoScalingRoleOutput = t.TypeOf<typeof MadAutoScalingRoleOutputType>;

/**
 * Get the fixed secret name that stores the MAD password.
 */
export function getMadRootPasswordSecretArn(props: {
  acceleratorPrefix: string;
  accountKey: string;
  secretAccountId: string;
}) {
  const { acceleratorPrefix, accountKey, secretAccountId } = props;
  const secretName = createMadPasswordSecretName({
    acceleratorPrefix,
    accountKey,
  });
  return getSecretArn({ secretAccountId, secretName });
}

/**
 * Get the fixed secret name that stores the MAD password for a user.
 */
export function getMadUserPasswordSecretArn(props: {
  acceleratorPrefix: string;
  accountKey: string;
  userId: string;
  secretAccountId: string;
}) {
  const { acceleratorPrefix, accountKey, userId, secretAccountId } = props;
  const secretName = createMadUserPasswordSecretName({
    acceleratorPrefix,
    accountKey,
    userId,
  });
  return getSecretArn({ secretAccountId, secretName });
}

/**
 * Builds a secret ARN with the given parameters.
 */
export function getSecretArn(props: { secretAccountId: string; secretAccountRegion?: string; secretName: string }) {
  const { secretAccountId, secretAccountRegion = cdk.Aws.REGION, secretName } = props;
  return `arn:${cdk.Aws.PARTITION}:secretsmanager:${secretAccountRegion}:${secretAccountId}:secret:${secretName}`;
}

export const CfnMadImageIdOutputTypeOutput = createCfnStructuredOutput(ImageIdOutput);
