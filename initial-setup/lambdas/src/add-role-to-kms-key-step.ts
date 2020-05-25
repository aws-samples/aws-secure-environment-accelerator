import * as aws from 'aws-sdk';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';

interface AddRoleToKmsKeyInput {
  roleName: string;
  accounts: Account[];
  kmsKeyId: string;
}

export const handler = async (input: AddRoleToKmsKeyInput) => {
  console.log(`Adding roles to KMS key policy...`);
  console.log(JSON.stringify(input, null, 2));

  const { roleName, kmsKeyId, accounts } = input;

  const kms = new aws.KMS();
  const getKeyPolicy = await kms
    .getKeyPolicy({
      KeyId: kmsKeyId,
      PolicyName: 'default',
    })
    .promise();

  const policy = getKeyPolicy?.Policy;
  if (!policy) {
    console.warn(`Cannot find default KMS key policy for key "${kmsKeyId}"`);
    return;
  }

  // Parse the policy and find the statement
  const content = JSON.parse(policy);
  // tslint:disable-next-line: no-any
  const statements: any[] = content.Statement;
  if (!statements) {
    console.warn(`The default KMS key policy for key "${kmsKeyId}" does not have a Statement field`);
    return;
  }

  // Add our role to all the statements
  const roles = accounts.map(a => `arn:aws:iam::${a.id}:role/${roleName}`);

  // Allow sub accounts to decrypt, encrypt, ...
  const subaccountStatement = {
    Sid: 'Subaccounts',
    Effect: 'Allow',
    Principal: {
      AWS: roles,
    },
    Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:GenerateDataKey*', 'kms:ReEncrypt*'],
    Resource: '*',
  };

  const existingSubaccountStatement = statements.find(s => s.Sid === subaccountStatement.Sid);
  if (existingSubaccountStatement) {
    // If the statement exists we override it
    Object.assign(existingSubaccountStatement, subaccountStatement);
  } else {
    // If the statement does not exist we add it
    statements.push(subaccountStatement);
  }

  console.log(`Updating the KMS key policy for key "${kmsKeyId}"`);
  console.log(JSON.stringify(content, null, 2));

  await kms
    .putKeyPolicy({
      KeyId: kmsKeyId,
      PolicyName: 'default',
      Policy: JSON.stringify(content),
    })
    .promise();

  return {
    status: 'SUCCESS',
    statusReason: `Updated the KMS key policy with name ${kmsKeyId}`,
  };
};
