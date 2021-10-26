import { createFixedSecretName } from './secrets';

export interface MadOutput {
  id: number;
  vpcName: string;
  directoryId: string;
  dnsIps: string;
  passwordArn: string;
}

/**
 * Creates a fixed secret name that will store the MAD password.
 */
export function createMadPasswordSecretName(props: { acceleratorPrefix: string; accountKey: string }) {
  const { acceleratorPrefix, accountKey } = props;
  return createFixedSecretName({
    acceleratorPrefix,
    parts: [accountKey, 'mad', 'password'],
  });
}

/**
 * Creates a fixed secret name that will store the MAD password for a user.
 */
export function createMadUserPasswordSecretName(props: {
  acceleratorPrefix: string;
  accountKey: string;
  userId: string;
}) {
  const { acceleratorPrefix, accountKey, userId } = props;
  return createFixedSecretName({
    acceleratorPrefix,
    parts: [accountKey, 'mad', userId, 'password'],
  });
}
