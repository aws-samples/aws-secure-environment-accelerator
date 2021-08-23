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
import { IamPasswordPolicy } from '@aws-accelerator/custom-resource-iam-password-policy';

export interface IamPasswordPolicyProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

/**
 *
 *  Set/Update the IAM account password policy
 *
 */
export async function step1(props: IamPasswordPolicyProps) {
  const { accountStacks, config } = props;
  const accountKeys = config.getAccountConfigs().map(([accountKey, _]) => accountKey);
  const passwordPolicy = config['global-options']['iam-password-policies'];

  if (!passwordPolicy) {
    console.warn(`passwordPolicy configuration is not there in Accelerator Configuration`);
    return;
  }

  for (const accountKey of accountKeys) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }

    new IamPasswordPolicy(accountStack, `IamPasswordPolicy${accountKey}`, {
      allowUsersToChangePassword: passwordPolicy['allow-users-to-change-password'],
      hardExpiry: passwordPolicy['hard-expiry'],
      requireUppercaseCharacters: passwordPolicy['require-uppercase-characters'],
      requireLowercaseCharacters: passwordPolicy['require-lowercase-characters'],
      requireSymbols: passwordPolicy['require-symbols'],
      requireNumbers: passwordPolicy['require-numbers'],
      minimumPasswordLength: passwordPolicy['minimum-password-length'],
      passwordReusePrevention: passwordPolicy['password-reuse-prevention'],
      maxPasswordAge: passwordPolicy['max-password-age'],
    });
  }
}
