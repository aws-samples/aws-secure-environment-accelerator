/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { TagResources } from '@aws-accelerator/common/src/aws/resource-tagging';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { loadOutputs } from './utils/load-outputs';

const ALLOWED_RESOURCE_TYPES = ['subnet', 'security-group', 'vpc', 'tgw-attachment'];

interface CreateTagsRequestInput {
  assumeRoleName: string;
  outputTableName: string;
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
  region: string;
}

type AddTagToResourceOutputs = AddTagToResourceOutput[];

const dynamodb = new DynamoDB();
const sts = new STS();

export const handler = async (input: CreateTagsRequestInput) => {
  console.log(`Adding tags to shared resource...`);
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName, outputTableName } = input;

  const outputs = await loadOutputs(outputTableName, dynamodb);
  const addTagsToResourcesOutputs: AddTagToResourceOutputs[] = getStackJsonOutput(outputs, {
    outputType: 'AddTagsToResources',
  });

  for (const addTagsToResourcesOutput of addTagsToResourcesOutputs) {
    for (const addTagsToResources of addTagsToResourcesOutput) {
      const { resourceId, resourceType, targetAccountIds, tags } = addTagsToResources;
      for (const targetAccountId of targetAccountIds) {
        console.log(`Tagging resource "${resourceId}" in account "${targetAccountId}"`);

        const credentials = await sts.getCredentialsForAccountAndRole(targetAccountId, assumeRoleName);
        if (ALLOWED_RESOURCE_TYPES.includes(resourceType)) {
          try {
            const tagResources = new TagResources(credentials, addTagsToResources.region);
            await tagResources.createTags({
              Resources: [resourceId],
              Tags: tags.map(t => ({ Key: t.key, Value: t.value })),
            });
          } catch (e) {
            console.warn(`Cannot tag resource "${resourceId}" in account "${targetAccountId}": ${e}`);
          }
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
