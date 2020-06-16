import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { SecretsContainer } from '@aws-pbmm/common-cdk/lib/core/secrets-container';
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
