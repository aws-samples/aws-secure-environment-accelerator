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

import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';

/**
 * Remove special characters from the start and end of a string.
 */
export function trimSpecialCharacters(str: string) {
  return str.replace(/^[^a-z\d]*|[^a-z\d]*$/gi, '');
}

/**
 * Create a secret name that does not contain any CDK tokens. The returned secret name can be used across accounts.
 */
export function createFixedSecretName(props: { acceleratorPrefix: string; parts: string[] }) {
  const { acceleratorPrefix, parts } = props;
  return [trimSpecialCharacters(acceleratorPrefix), ...parts].join('/');
}

export const SecretEncryptionKeyOutput = t.interface(
  {
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
    encryptionKeyArn: t.string,
  },
  'SecretEncryptionKeyOutput',
);

export type SecretEncryptionKeyOutput = t.TypeOf<typeof SecretEncryptionKeyOutput>;

export const SecretEncryptionKeyOutputFinder = createStructuredOutputFinder(SecretEncryptionKeyOutput, () => ({}));

export const DynamicSecretOutput = t.interface(
  {
    name: t.string,
    arn: t.string,
    value: t.string,
  },
  'DynamicSecretOutput',
);
export type DynamicSecretOutput = t.TypeOf<typeof DynamicSecretOutput>;
export const DynamicSecretOutputFinder = createStructuredOutputFinder(DynamicSecretOutput, () => ({}));
