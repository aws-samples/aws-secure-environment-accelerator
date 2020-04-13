import * as aws from 'aws-sdk';
import { TagResources } from '@aws-pbmm/common-lambda/lib/aws/resource-tagging';

interface CreateTagsRequestInput {
  Resources: string[];
  Tags: { Key: string; Value: string }[];
}

export const handler = async (input: CreateTagsRequestInput) => {
  console.log(`Adding Tags to the resources...`);
  console.log(JSON.stringify(input, null, 2));
  const tagResources = new TagResources();
  await tagResources.createTags(input);
  return {
    status: 'SUCCESS',
    statusReason: `Updated the Tags for the resources ${input.Resources}`,
  };
};
