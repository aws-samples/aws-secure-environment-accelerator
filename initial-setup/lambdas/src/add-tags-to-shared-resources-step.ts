import * as aws from 'aws-sdk';
import { TagResources } from '@aws-pbmm/common-lambda/lib/aws/resource-tagging';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

const ALLOWED_RESOURCE_TYPES = ['subnet', 'security-group', 'vpc'];

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
  resourceType: string;
  targetAccountIds: string[];
  tags: Tag[];
}

type AddTagToResourceOutputs = AddTagToResourceOutput[];

export const handler = async (input: CreateTagsRequestInput) => {
  console.log(`Adding tags to shared resource...`);
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName, stackOutputSecretId } = input;

  const secrets = new SecretsManager();
  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

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

  const addTagsToResourcesOutputs: AddTagToResourceOutputs[] = getStackJsonOutput(outputs, {
    outputType: 'AddTagsToResources',
  });

  for (const addTagsToResourcesOutput of addTagsToResourcesOutputs) {
    for (const addTagsToResources of addTagsToResourcesOutput) {
      const { resourceId, resourceType, targetAccountIds, tags } = addTagsToResources;
      for (const targetAccountId of targetAccountIds) {
        console.log(`Tagging resource "${resourceId}" in account "${targetAccountId}"`);

        const credentials = await getAccountCredentials(targetAccountId);
        if (ALLOWED_RESOURCE_TYPES.includes(resourceType)) {
          const tagResources = new TagResources(credentials);
          await tagResources.createTags({
            Resources: [resourceId],
            Tags: tags.map(t => ({ Key: t.key, Value: t.value })),
          });
        } else {
          console.warn(`Unsupported resource type "${resourceType}"`);
        }
      }
    }
  }

  return {
    status: 'SUCCESS',
    statusReason: `Added tags for all the shared resources`,
  };
};
