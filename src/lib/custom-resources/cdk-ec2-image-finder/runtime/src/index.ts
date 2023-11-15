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
import { DescribeImagesCommandInput, EC2 } from '@aws-sdk/client-ec2';
// JS SDK v3 does not support global configuration.
// Codemod has attempted to pass values to each service client in this file.
// You may need to update clients outside of this file, if they use global config.
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const ec2 = new EC2({
  logger: console,
});

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
  console.log(`Finding tunnel options...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
};

async function onCreate(event: CloudFormationCustomResourceEvent) {
  // Find images that match the given owner, name and version
  const describeImages = await throttlingBackOff(() =>
    ec2
      .describeImages(buildRequest({
      owner: event.ResourceProperties.ImageOwner,
      name: event.ResourceProperties.ImageName,
      version: event.ResourceProperties.ImageVersion,
      productCode: event.ResourceProperties.ImageProductCode,
    })),
  );

  const images = describeImages.Images;
  const image = images?.[0];
  if (!image) {
    throw new Error(`Unable to find image`);
  }

  return {
    Data: {
      ImageID: image.ImageId,
    },
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}

/**
 * Auxiliary method to build a DescribeImagesRequest from the given parameters.
 */
function buildRequest(props: {
  owner?: string;
  name?: string;
  version?: string;
  productCode: string;
}): DescribeImagesCommandInput {
  const { owner, name, version, productCode } = props;

  const owners = [];
  if (owner) {
    owners.push(owner);
  }

  const filters = [];
  if (name) {
    filters.push({
      Name: 'name',
      Values: [name],
    });
  }
  if (version) {
    filters.push({
      Name: 'name',
      Values: [version],
    });
  }
  if (productCode) {
    filters.push({
      Name: 'product-code',
      Values: [productCode],
    });
  }
  return {
    Owners: owners,
    Filters: filters,
  };
}
