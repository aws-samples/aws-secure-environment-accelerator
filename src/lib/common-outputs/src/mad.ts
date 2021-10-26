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

import { createFixedSecretName } from './secrets';

export interface MadOutput {
  id: number;
  vpcName: string;
  directoryId: string;
  dnsIps: string;
  passwordArn: string;
}

/**
 * Creates a fixed secret name that will store the MAD password.
 */
export function createMadPasswordSecretName(props: { acceleratorPrefix: string; accountKey: string }) {
  const { acceleratorPrefix, accountKey } = props;
  return createFixedSecretName({
    acceleratorPrefix,
    parts: [accountKey, 'mad', 'password'],
  });
}

/**
 * Creates a fixed secret name that will store the MAD password for a user.
 */
export function createMadUserPasswordSecretName(props: {
  acceleratorPrefix: string;
  accountKey: string;
  userId: string;
}) {
  const { acceleratorPrefix, accountKey, userId } = props;
  return createFixedSecretName({
    acceleratorPrefix,
    parts: [accountKey, 'mad', userId, 'password'],
  });
}
