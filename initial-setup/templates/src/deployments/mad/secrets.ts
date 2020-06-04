import * as iam from '@aws-cdk/aws-iam';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { SecretsContainer } from '@aws-pbmm/common-cdk/lib/core/secrets-container';
import { getAccountId, Account } from '../../utils/accounts';
import { createMadUserPasswordSecretName, createMadPasswordSecretName } from './outputs';

export interface MadSecretsProps {
  acceleratorPrefix: string;
  accounts: Account[];
  config: AcceleratorConfig;
  secretsContainer: SecretsContainer;
}

/**
 * Create secrets that will later be used for MAD user creation.
 */
export async function createSecrets(props: MadSecretsProps) {
  const { acceleratorPrefix, accounts, config, secretsContainer } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }

    const accountId = getAccountId(accounts, accountKey);
    const accountPrincipal = new iam.AccountPrincipal(accountId);

    // Create the AD password
    secretsContainer.createSecret('MadPassword', {
      secretName: createMadPasswordSecretName({
        acceleratorPrefix,
        accountKey,
      }),
      description: 'Password for Managed Active Directory.',
      generateSecretString: {
        passwordLength: 16,
      },
      principals: [accountPrincipal],
    });

    // Create the AD users passwords
    for (const adUser of madDeploymentConfig['ad-users']) {
      secretsContainer.createSecret(`MadPassword${adUser.user}`, {
        secretName: createMadUserPasswordSecretName({
          acceleratorPrefix,
          accountKey,
          userId: adUser.user,
        }),
        description: 'Password for Managed Active Directory.',
        generateSecretString: {
          passwordLength: madDeploymentConfig['password-policies']['min-len'],
        },
        principals: [accountPrincipal],
      });
    }
  }
}
