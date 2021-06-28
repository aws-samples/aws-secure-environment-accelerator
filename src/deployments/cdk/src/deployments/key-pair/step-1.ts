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
