import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { SecretsContainer } from '@aws-accelerator/cdk-accelerator/src/core/secrets-container';
import { StructuredOutput } from '../../common/structured-output';
import { SecretEncryptionKeyOutput, SecretEncryptionKeyOutputType } from './outputs';

export interface SecretsStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
}

export async function step1(props: SecretsStep1Props) {
  const { accountStacks, config } = props;

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  // Create secrets for the different deployments
  const secretsContainer = new SecretsContainer(masterAccountStack, 'Secrets');

  new StructuredOutput<SecretEncryptionKeyOutput>(masterAccountStack, 'SecretEncryptionKey', {
    type: SecretEncryptionKeyOutputType,
    value: {
      encryptionKeyArn: secretsContainer.encryptionKey.keyArn,
    },
  });

  return {
    secretsContainer,
  };
}
