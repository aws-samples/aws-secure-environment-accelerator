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

import * as crypto from 'crypto';
import * as cdk from '@aws-cdk/core';
import { AcceleratorStack } from './accelerator-stack';
import { trimSpecialCharacters } from './utils';

export function createRoleName(name: string, suffixLength: number = 8): string {
  return createName({
    name,
    suffixLength,
  });
}

export function createEncryptionKeyName(name: string): string {
  return createName({
    name,
    suffixLength: 8,
  });
}

export function createKeyPairName(name: string): string {
  return createName({
    name,
    suffixLength: 8,
  });
}

export function createLogGroupName(name: string, suffixLength?: number): string {
  return (
    '/' +
    createName({
      name,
      separator: '/',
      suffixLength,
    })
  );
}

export function createSecretPrefix(name: string, suffixLength?: number): string {
  return createName({
    name,
    separator: '/',
    suffixLength,
  });
}

export function createSnsTopicName(name: string, suffixLength?: number): string {
  return createName({
    name: `Notification-${name}`,
    suffixLength: suffixLength || 0,
  });
}

export function createPolicyName(name: string): string {
  return createName({
    name,
    suffixLength: 8,
  });
}

const DEFAULT_SEPARATOR = '-';

export interface CreateNameProps {
  /**
   * @default undefined
   */
  suffixLength?: number;
  /**
   * @default '-'
   */
  separator?: string;
  /**
   * @default false
   */
  account?: boolean;
  /**
   * @default false
   */
  region?: boolean;
  /**
   * @default undefined
   */
  name?: string;
  /**
   * @default false
   */
  lowercase?: boolean;
}

/**
 * READ THIS BEFORE MODIFYING THIS FUNCTION: Changes made to this function will most likely create new bucket names for
 * resources in a customer's account. Please take this into account!
 *
 * Generates a name with the Accelerator prefix of the AcceleratorStack, the given name and a random prefix based on
 * the constructs path.
 *
 * @param name
 */
export function createName(props: CreateNameProps = {}): string {
  return cdk.Lazy.uncachedString({
    produce: (context: cdk.IResolveContext) => {
      const { scope } = context;
      const { name, account, region, suffixLength, separator = DEFAULT_SEPARATOR } = props;

      // Find the AcceleratorStack in the parents.
      const stack = AcceleratorStack.of(scope);

      // Use the AcceleratorStack prefix
      const prefix = trimSpecialCharacters(stack.acceleratorPrefix);

      const pieces = [prepareString(prefix, props)];
      if (account) {
        pieces.push(cdk.Aws.ACCOUNT_ID);
      }
      if (region) {
        pieces.push(cdk.Aws.REGION);
      }
      if (name) {
        pieces.push(prepareString(name, props));
      }
      if (suffixLength && suffixLength > 0) {
        // Create a suffix that is based on the path of the component
        const parents = scope.node.scopes;
        const path = parents.map(p => p.node.id);
        const suffix = hashPath(path, suffixLength);
        pieces.push(prepareString(suffix, props));
      }
      return pieces.join(separator);
    },
  });
}

/**
 * Based on `makeUniqueId`
 *
 * https://github.com/aws/aws-cdk/blob/f8df4e04f6f9631f963353903e020cfa8377e8bc/packages/%40aws-cdk/core/lib/private/uniqueid.ts#L33
 */
export function hashPath(path: string[], length: number) {
  const hash = crypto.createHash('md5').update(path.join('/')).digest('hex');
  return hash.slice(0, length).toUpperCase();
}

/**
 * Prepare the given string with the given props. Currently only lowercases the string.
 */
function prepareString(str: string, props: { lowercase?: boolean }): string {
  if (cdk.Token.isUnresolved(str)) {
    // We should not modify an unresolved token
    return str;
  } else if (props.lowercase) {
    return str.toLowerCase();
  }
  return str;
}
