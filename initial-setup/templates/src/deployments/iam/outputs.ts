import * as cdk from '@aws-cdk/core';
import { createFixedSecretName } from '@aws-pbmm/common-outputs/lib/secrets';

import { createCfnStructuredOutput } from '../../common/structured-output';
import { IamRoleOutput } from '@aws-pbmm/common-outputs/lib/iam-role';

export const CfnIamRoleOutput = createCfnStructuredOutput(IamRoleOutput);

export function createIamUserPasswordSecretName({
  acceleratorPrefix,
  accountKey,
  userId,
}: {
  acceleratorPrefix: string;
  accountKey: string;
  userId: string;
}) {
  return createFixedSecretName({
    acceleratorPrefix,
    parts: [accountKey, 'user', 'password', userId],
  });
}

export function getIamUserPasswordSecretValue({
  acceleratorPrefix,
  accountKey,
  userId,
  secretAccountId,
}: {
  acceleratorPrefix: string;
  accountKey: string;
  userId: string;
  secretAccountId: string;
}) {
  const secretName = createIamUserPasswordSecretName({
    acceleratorPrefix,
    accountKey,
    userId,
  });
  return cdk.SecretValue.secretsManager(
    `arn:${cdk.Aws.PARTITION}:secretsmanager:${cdk.Aws.REGION}:${secretAccountId}:secret:${secretName}`,
  );
}
