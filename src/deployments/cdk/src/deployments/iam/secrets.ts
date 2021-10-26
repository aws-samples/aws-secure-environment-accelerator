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
        },
        principals: [accountPrincipal],
      });
      userPasswords[userId] = password;
    }
  }
  return userPasswords;
}
