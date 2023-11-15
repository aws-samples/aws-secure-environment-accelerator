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

import * as AWS from 'aws-sdk';
import { Tag } from '@aws-sdk/client-cloudformation';
import { GetResourcesCommandOutput, ResourceGroupsTaggingAPI, ResourceTagMapping } from '@aws-sdk/client-resource-groups-tagging-api';

const TAG_STACK_ID = 'accelerator:cloudformation:stack-id';
const TAG_LOGICAL_ID = 'accelerator:cloudformation:logical-id';
const TAG_LAST_UPDATE = 'accelerator:cloudformation:last-update';

const tagging = new ResourceGroupsTaggingAPI({
  logger: console,
});

export type WithLogicalResourceId = { StackId: string; LogicalResourceId: string };

export type Tag = Tag;

export type Taggable = { Tags: Tag[] };

export function createCustomResourceTags(resource: WithLogicalResourceId) {
  return [
    {
      Key: TAG_STACK_ID,
      Value: resource.StackId,
    },
    {
      Key: TAG_LOGICAL_ID,
      Value: resource.LogicalResourceId,
    },
    {
      Key: TAG_LAST_UPDATE,
      Value: `${new Date().getTime()}`,
    },
  ];
}

export function addCustomResourceTags(tags: Partial<Tag>[] | undefined, resource: WithLogicalResourceId): Tag[] {
  const customResourceTags = createCustomResourceTags(resource);
  if (tags) {
    const validTags = tags.filter((t: Partial<Tag>): t is Tag => !!t.Key && !!t.Value);
    return [...validTags, ...customResourceTags];
  }
  return customResourceTags;
}

export async function getLatestTaggedCustomResource(
  resource: WithLogicalResourceId,
): Promise<ResourceTagMapping | undefined> {
  const resources = await getTaggedCustomResources(resource);
  if (resources.length === 0) {
    return undefined;
  }
  if (resources.length > 1) {
    resources.sort((a, b) => getResourceLastUpdateTime(b) - getResourceLastUpdateTime(a));
  }
  return resources[0];
}

export async function getTaggedCustomResources(
  resource: WithLogicalResourceId,
): Promise<ResourceTagMapping[]> {
  const resourceList = [];
  let paginationToken;
  do {
    const getResources: GetResourcesCommandOutput = await tagging
      .getResources({
        PaginationToken: paginationToken,
        TagFilters: [
          {
            Key: TAG_STACK_ID,
            Values: [resource.StackId],
          },
          {
            Key: TAG_LOGICAL_ID,
            Values: [resource.LogicalResourceId],
          },
        ],
      });
    paginationToken = getResources.PaginationToken;
    if (getResources.ResourceTagMappingList) {
      resourceList.push(...getResources.ResourceTagMappingList);
    }
  } while (paginationToken);
  return resourceList;
}

export function getResourceLastUpdateTime(mapping: ResourceTagMapping): number {
  const tag = mapping.Tags?.find(t => t.Key === TAG_LAST_UPDATE);
  if (tag?.Value) {
    try {
      return +tag.Value;
    } catch (e) {
      console.log(e);
    }
  }
  return 0;
}
