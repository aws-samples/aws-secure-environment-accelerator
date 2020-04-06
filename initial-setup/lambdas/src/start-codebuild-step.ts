import * as aws from 'aws-sdk';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { Account } from './load-accounts-step';

interface CodeBuildStartInput {
  assumeRoleAccount: Account;
  assumeRoleName: string;
  codeBuildProjectName: string;
  sourceBucketName: string;
  sourceBucketKey: string;
}

export const handler = async (input: CodeBuildStartInput) => {
  console.log(`Starting CodeBuild project...`);
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleAccount, assumeRoleName, codeBuildProjectName, sourceBucketName, sourceBucketKey } = input;

  // TODO Remove this extra check
  if (assumeRoleAccount.name !== 'shared-network' && assumeRoleAccount.name !== 'SharedNetwork') {
    console.warn(`Not starting CodeBuild for account with name "${assumeRoleAccount.name}"`);
    return;
  }

  // TODO Get the stack name somehow
  const stackName = 'PBMMAccel-SharedNetwork';

  const sts = new STS();
  const credentials = await sts.getCredentialsForAccountAndRole(assumeRoleAccount.id, assumeRoleName);

  const build = new aws.CodeBuild();
  const response = await build
    .startBuild({
      projectName: codeBuildProjectName,
      sourceTypeOverride: 'S3',
      sourceLocationOverride: `${sourceBucketName}/${sourceBucketKey}`,
      artifactsOverride: {
        type: 'NO_ARTIFACTS',
      },
      environmentVariablesOverride: [
        {
          name: 'ASSUME_ACCESS_KEY_ID',
          value: credentials.accessKeyId,
          type: 'PLAINTEXT',
        },
        {
          name: 'ASSUME_SECRET_ACCESS_KEY',
          value: credentials.secretAccessKey,
          type: 'PLAINTEXT',
        },
        {
          name: 'ASSUME_SESSION_TOKEN',
          value: credentials.sessionToken,
          type: 'PLAINTEXT',
        },
        {
          name: 'STACK_NAME',
          value: stackName, // TODO Replace with input variable
          type: 'PLAINTEXT',
        },
      ],
    })
    .promise();
};
