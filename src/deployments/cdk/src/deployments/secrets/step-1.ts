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

import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { SecretsContainer } from '@aws-accelerator/cdk-accelerator/src/core/secrets-container';
import { StructuredOutput } from '../../common/structured-output';
import { SecretEncryptionKeyOutput, SecretEncryptionKeyOutputType } from './outputs';
import { randomAlphanumericString } from '@aws-accelerator/common/src/util/common';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnDynamicSecretOutput } from '../mad';
import { DynamicSecretOutputFinder } from '@aws-accelerator/common-outputs/src/secrets';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';

export interface SecretsStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  /**
   * outputs: to validate secret is already created or not.
   * Need to validate since we are assigning random value which will change on every execution.
   */
  outputs: StackOutput[];
}

export async function step1(props: SecretsStep1Props) {
  const { accountStacks, config, outputs } = props;

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  // Create secrets for the different deployments
  const secretsContainer = new SecretsContainer(masterAccountStack, 'Secrets');

  new StructuredOutput<SecretEncryptionKeyOutput>(masterAccountStack, 'SecretEncryptionKey', {
    type: SecretEncryptionKeyOutputType,
    value: {
      encryptionKeyName: secretsContainer.alias,
      encryptionKeyId: secretsContainer.encryptionKey.keyId,
      encryptionKeyArn: secretsContainer.encryptionKey.keyArn,
    },
  });

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    for (const { name, region, size } of accountConfig.secrets) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }
      const secretOutput = DynamicSecretOutputFinder.tryFindOne({
        accountKey,
        region,
        outputs,
        predicate: o => o.name === name,
      });
      let secretString = '';
      if (secretOutput) {
        secretString = secretOutput.value;
      } else {
        secretString = randomAlphanumericString(size);
      }
      const secretObj = new secretsmanager.CfnSecret(accountStack, `Dynamic-Secret-${name}`, {
        description: `Secret Created by Accelerator`,
        name: createName({
          name,
          suffixLength: 0,
        }),
        secretString,
      });
      new CfnDynamicSecretOutput(accountStack, `Dynamic-Secret-${name}-Output`, {
        arn: secretObj.ref,
        name,
        value: secretString,
      });
    }
  }

  return {
    secretsContainer,
  };
}
