import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';

export interface StepInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  commitSecretId: string;
}

export const handler = async (input: StepInput): Promise<void> => {
  console.log(`Loading compare configurations...`);
  console.log(JSON.stringify(input, null, 2));

  const { configFilePath, configRepositoryName, configCommitId, commitSecretId } = input;

  // Store the git repository config file commit id in the secrets manager
  const secrets = new SecretsManager();
  await secrets.putSecretValue({
    SecretId: commitSecretId,
    SecretString: configCommitId,
  });
};