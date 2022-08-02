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

import { S3 } from '@aws-accelerator/common/src/aws/s3';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { TagResources } from '@aws-accelerator/common/src/aws/resource-tagging';
import { getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';

const ALLOWED_RESOURCE_TYPES = ['subnet', 'security-group', 'vpc', 'tgw-attachment'];

interface CreateTagsRequestInput {
  assumeRoleName: string;
  outputTableName: string;
  s3Bucket: string;
  s3Key: string;
  accountId: string;
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

const sts = new STS();
const s3 = new S3();

export const handler = async (input: CreateTagsRequestInput) => {
  console.log(JSON.stringify(input, null, 2));

  const { assumeRoleName, outputTableName, s3Bucket, s3Key, accountId } = input;
  console.log(`Adding Tags to Shared Resources in account ${accountId}`);

  if (!s3Bucket || !s3Key) {
    return {
      status: 'FAILURE',
      statusReason: `${s3Bucket}/${s3Key} not found please review.`
    };
  }

  const ddbScanResults: StackOutput[] = await loadDDBScanFromS3(s3Bucket, s3Key);

  const addTagsToResourcesOutputs: AddTagToResourceOutputs[] = getStackJsonOutput(ddbScanResults, {
    outputType: 'AddTagsToResources',
  });

  await tagResources(addTagsToResourcesOutputs, accountId, assumeRoleName);
    
  return {
    status: 'SUCCESS',
    statusReason: `Added tags for all the shared resources in account: ${accountId}`,
  };

}

async function loadDDBScanFromS3(bucket: string, key: string): Promise<StackOutput[]> {
  try {
    const ddbScanResults = 
      await s3.getObjectBodyAsString({
        Bucket: bucket,
        Key: key,
      })
    return JSON.parse(ddbScanResults)
  } catch (e) {
    throw new Error(
      `Cannot find"${key}" in bucket "${bucket}": code:${e.code}`,
    );
  }
}

async function tagResources(addTagsToResourcesOutputs: AddTagToResourceOutputs[], accountId: string, assumeRoleName: string){
  const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
  for (const addTagsToResourcesOutput of addTagsToResourcesOutputs) {
    for (const addTagsToResources of addTagsToResourcesOutput) {
      await tagIndividualResource(addTagsToResources)
    }
  }
  
  async function tagIndividualResource(addTagsToResources: AddTagToResourceOutput){
    const { resourceId, resourceType, targetAccountIds, tags, region } = addTagsToResources;
    if(targetAccountIds.includes(accountId)){
      console.log(`Tagging resource "${resourceId}" in account "${accountId}"`);
      if (ALLOWED_RESOURCE_TYPES.includes(resourceType)) {
        try {
         //This instantiation is here because of region specificity 
            const tagResources = new TagResources(credentials, region);
            await tagResources.createTags({
            Resources: [resourceId],
            Tags: tags.map(t => ({ Key: t.key, Value: t.value })),
          })
        } catch (e) {
          console.warn(`Cannot tag resource "${resourceId}" in account "${accountId}": ${e}`);
        }
      } else {
        console.warn(`Unsupported resource type "${resourceType}"`);
      } 
    }
  }
}

