import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';

/**
 * Remove special characters from the start and end of a string.
 */
export function trimSpecialCharacters(str: string) {
  return str.replace(/^[^a-z\d]*|[^a-z\d]*$/gi, '');
}

/**
 * Create a secret name that does not contain any CDK tokens. The returned secret name can be used across accounts.
 */
export function createFixedSecretName(props: { acceleratorPrefix: string; parts: string[] }) {
  const { acceleratorPrefix, parts } = props;
  return [trimSpecialCharacters(acceleratorPrefix), ...parts].join('/');
}

export const SecretEncryptionKeyOutput = t.interface(
  {
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
    encryptionKeyArn: t.string,
  },
  'SecretEncryptionKeyOutput',
);

export type SecretEncryptionKeyOutput = t.TypeOf<typeof SecretEncryptionKeyOutput>;

export const SecretEncryptionKeyOutputFinder = createStructuredOutputFinder(SecretEncryptionKeyOutput, () => ({}));

export const DynamicSecretOutput = t.interface(
  {
    name: t.string,
    arn: t.string,
    value: t.string,
  },
  'DynamicSecretOutput',
);
export type DynamicSecretOutput = t.TypeOf<typeof DynamicSecretOutput>;
export const DynamicSecretOutputFinder = createStructuredOutputFinder(DynamicSecretOutput, () => ({}));
