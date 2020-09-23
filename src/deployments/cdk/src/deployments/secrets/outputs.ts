import * as t from 'io-ts';

export const SecretEncryptionKeyOutputType = t.interface(
  {
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
    encryptionKeyArn: t.string,
  },
  'SecretEncryptionKeyOutput',
);

export type SecretEncryptionKeyOutput = t.TypeOf<typeof SecretEncryptionKeyOutputType>;
