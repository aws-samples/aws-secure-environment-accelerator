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

import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorKeypair } from '@aws-accelerator/cdk-accelerator/src/core/key-pair';
import { trimSpecialCharacters } from '@aws-accelerator/common-outputs/src/secrets';

export interface KeyPairStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

/**
 * Creates the Keypairs defined in configuration.
 *
 */
export async function step1(props: KeyPairStep1Props) {
  const { accountStacks, config } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    if (accountConfig['key-pairs'].length === 0) {
      continue;
    }
    for (const { name, region } of accountConfig['key-pairs']) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }
      new AcceleratorKeypair(accountStack, `KeyPair-${name}`, {
        name,
      });
    }
  }
}

export function getkeyPairSecretName(name: string, acceleratorPrefix: string) {
  const prefix = trimSpecialCharacters(acceleratorPrefix);
  return `${prefix}/${name}`;
}
