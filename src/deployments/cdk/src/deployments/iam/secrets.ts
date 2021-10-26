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

import * as iam from '@aws-cdk/aws-iam';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { SecretsContainer } from '@aws-accelerator/cdk-accelerator/src/core/secrets-container';
import { getAccountId, Account } from '../../utils/accounts';
import { createIamUserPasswordSecretName } from './outputs';

export interface IamSecretsProps {
  acceleratorPrefix: string;
  accounts: Account[];
  config: AcceleratorConfig;
  secretsContainer: SecretsContainer;
}

export type IamSecretsResult = { [userId: string]: secrets.Secret };

/**
 * Create secrets that will later be used for IAM user creation.
 */
export async function createSecrets(props: IamSecretsProps): Promise<IamSecretsResult> {
  const { acceleratorPrefix, accounts, config, secretsContainer } = props;

  const userPasswords: IamSecretsResult = {};
  for (const { accountKey, iam: iamConfig } of config.getIamConfigs()) {
    const accountId = getAccountId(accounts, accountKey);
    const accountPrincipal = new iam.AccountPrincipal(accountId);

    const users = iamConfig.users || [];
    const userIds = users.flatMap(u => u['user-ids']);
    for (const userId of userIds) {
      const password = secretsContainer.createSecret(`${userId}-UserPswd`, {
        secretName: createIamUserPasswordSecretName({
          acceleratorPrefix,
          accountKey,
          userId,
        }),
        description: `Password for IAM User - ${userId}.`,
        generateSecretString: {
          passwordLength: 24,
          requireEachIncludedType: true,
          excludeCharacters: '",./:;<>?\\`~',
        },
        principals: [accountPrincipal],
      });
      userPasswords[userId] = password;
    }
  }
  return userPasswords;
}
