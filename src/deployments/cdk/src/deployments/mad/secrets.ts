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
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { SecretsContainer } from '@aws-accelerator/cdk-accelerator/src/core/secrets-container';
import { getAccountId, Account } from '../../utils/accounts';
import { createMadUserPasswordSecretName, createMadPasswordSecretName } from './outputs';

export interface MadSecretsProps {
  acceleratorExecutionRoleName: string;
  acceleratorPrefix: string;
  accounts: Account[];
  config: AcceleratorConfig;
  secretsContainer: SecretsContainer;
}

/**
 * Create secrets that will later be used for MAD user creation.
 */
export async function createSecrets(props: MadSecretsProps) {
  const { acceleratorExecutionRoleName, acceleratorPrefix, accounts, config, secretsContainer } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const madConfig = accountConfig.deployments?.mad;
    if (!madConfig || !madConfig.deploy) {
      continue;
    }

    const accountId = getAccountId(accounts, accountKey);

    // Grant the Accelerator role access to get secret value
    // Otherwise CloudFormation will not be able to resolve the secret value cross-account
    const acceleratorRole = new iam.ArnPrincipal(`arn:aws:iam::${accountId}:role/${acceleratorExecutionRoleName}`);

    // Create the AD password
    secretsContainer.createSecret('MadPassword', {
      secretName: createMadPasswordSecretName({
        acceleratorPrefix,
        accountKey,
      }),
      description: 'Password for Managed Active Directory.',
      generateSecretString: {
        passwordLength: 16,
        requireEachIncludedType: true,
      },
      principals: [acceleratorRole],
    });

    // Create the AD users passwords
    for (const adUser of madConfig['ad-users']) {
      secretsContainer.createSecret(`MadPassword${adUser.user}`, {
        secretName: createMadUserPasswordSecretName({
          acceleratorPrefix,
          accountKey,
          userId: adUser.user,
        }),
        description: 'Password for Managed Active Directory.',
        generateSecretString: {
          passwordLength: madConfig['password-policies']['min-len'],
          requireEachIncludedType: true,
        },
        principals: [acceleratorRole],
      });
    }
  }
}
