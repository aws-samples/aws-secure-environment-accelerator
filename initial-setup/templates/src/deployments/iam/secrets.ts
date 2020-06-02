import * as iam from '@aws-cdk/aws-iam';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { SecretsContainer } from '@aws-pbmm/common-cdk/lib/core/secrets-container';
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
export function createSecrets(props: IamSecretsProps): IamSecretsResult {
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
          passwordLength: 16,
        },
        principals: [accountPrincipal],
      });
      userPasswords[userId] = password;
    }
  }
  return userPasswords;
}
