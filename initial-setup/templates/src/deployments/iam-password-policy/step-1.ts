import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { IamPasswordPolicy } from '@custom-resources/iam-password-policy';

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
