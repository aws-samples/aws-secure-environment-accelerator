import * as aws from 'aws-sdk';
import { TagResources } from '@aws-pbmm/common-lambda/lib/aws/resource-tagging';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { AccountStackOutput } from './store-stack-output-step';

interface CreateTagsRequestInput {
  assumeRoleName: string;
  stackOutputSecretId: string;
}

interface Tag {
  key: string;
  value: string;
}

interface AddTagToResourceOutput {
  resourceId: string;
  resourceType: 'subnet' | string;
  targetAccountIds: string[];
  tags: Tag[];
}

type AddTagToResourceOutputs = AddTagToResourceOutput[];

interface TypedOutput {
  type?: 'AddTagsToResources';
  resources?: AddTagToResourceOutputs;
}

export const handler = async (input: CreateTagsRequestInput) => {
  console.log(`Adding tags to shared resource...`);
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName, stackOutputSecretId } = input;

  const secrets = new SecretsManager();
  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as AccountStackOutput[];

  const sts = new STS();
  const accountCredentials: { [accountId: string]: aws.Credentials } = {};
  const getAccountCredentials = async (accountId: string): Promise<aws.Credentials> => {
    if (accountCredentials[accountId]) {
      return accountCredentials[accountId];
    }
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    accountCredentials[accountId] = credentials;
    return credentials;
  };

  for (const output of outputs) {
    let parsed: TypedOutput | undefined;
    try {
      parsed = JSON.parse(output.outputValue!) as TypedOutput;
      // tslint:disable-next-line: no-empty
    } catch {}

    // Verify if the output is a 'AddTagsToResources' output
    if (parsed && parsed.type === 'AddTagsToResources' && parsed.resources) {
      for (const shared of parsed.resources) {
        const { resourceId, resourceType, targetAccountIds, tags } = shared;
        for (const targetAccountId of targetAccountIds) {
          console.log(`Tagging resource "${resourceId}" in account "${targetAccountId}"`);

          const credentials = await getAccountCredentials(targetAccountId);
          if (resourceType === 'subnet') {
            const tagResources = new TagResources(credentials);
            await tagResources.createTags({
              Resources: [resourceId],
              Tags: tags.map(t => ({ Key: t.key, Value: t.value })),
            });
          } else {
            throw new Error(`Unsupported resource type "${resourceType}"`);
          }
        }
      }
    }
  }

  return {
    status: 'SUCCESS',
    statusReason: `Added tags for all the shared resources`,
  };
};
