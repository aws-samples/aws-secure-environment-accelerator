import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { createFixedSecretName } from '@aws-accelerator/common-outputs/src/secrets';

import { createCfnStructuredOutput } from '../../common/structured-output';
import { IamRoleOutput, IamPolicyOutput } from '@aws-accelerator/common-outputs/src/iam-role';
import { IamUserOutput, IamGroupOutput } from '@aws-accelerator/common-outputs/src/iam-users';
import { AccountStack } from '../../common/account-stacks';

export const CfnIamRoleOutput = createCfnStructuredOutput(IamRoleOutput);

export const CfnIamPolicyOutput = createCfnStructuredOutput(IamPolicyOutput);

export const CfnIamUserOutput = createCfnStructuredOutput(IamUserOutput);

export const CfnIamGroupOutput = createCfnStructuredOutput(IamGroupOutput);

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

export function createIamRoleOutput(stack: AccountStack, role: iam.IRole, outputName: string) {
  new CfnIamRoleOutput(stack, `${outputName}Output`, {
    roleName: role.roleName,
    roleArn: role.roleArn,
    roleKey: outputName,
  });
}
