import * as t from 'io-ts';

export const SecretEncryptionKeyOutputType = t.interface(
  {
    encryptionKeyArn: t.string,
  },
  'SecretEncryptionKeyOutput',
);

export type SecretEncryptionKeyOutput = t.TypeOf<typeof SecretEncryptionKeyOutputType>;
