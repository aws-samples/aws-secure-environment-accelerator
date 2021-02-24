import { SecretsManager } from '@aws-accelerator/common/src/aws/secrets-manager';
import { getCommitIdSecretName } from '@aws-accelerator/common-outputs/src/commitid-secret';

export interface StepInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  acceleratorVersion: string;
}

export const handler = async (input: StepInput): Promise<void> => {
  console.log(`Loading compare configurations...`);
  console.log(JSON.stringify(input, null, 2));

  const { configCommitId, acceleratorVersion } = input;
  const commitSecretId = getCommitIdSecretName();

  // Store the git repository config file commit id in the secrets manager
  const secrets = new SecretsManager();
  let previousCommitIdSecret;
  try {
    previousCommitIdSecret = await secrets.getSecret(commitSecretId);
  } catch (e) {
    console.log('previous successful run commitId secret not found');
  }

  const secretValue = {
    configCommitId,
    acceleratorVersion,
  };

  if (!previousCommitIdSecret) {
    await secrets.createSecret({
      Name: commitSecretId,
      SecretString: JSON.stringify(secretValue),
      Description: 'This secret contains the last successful commit ID of the Git repository configuration file',
    });
  } else {
    await secrets.putSecretValue({
      SecretId: commitSecretId,
      SecretString: JSON.stringify(secretValue),
    });
  }
};
