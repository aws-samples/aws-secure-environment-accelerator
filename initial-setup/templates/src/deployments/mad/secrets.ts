import * as iam from '@aws-cdk/aws-iam';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { SecretsContainer } from '@aws-pbmm/common-cdk/lib/core/secrets-container';
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
