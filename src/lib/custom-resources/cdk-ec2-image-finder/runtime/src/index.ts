import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const ec2 = new AWS.EC2();

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
      .describeImages(
        buildRequest({
          owner: event.ResourceProperties.ImageOwner,
          name: event.ResourceProperties.ImageName,
          version: event.ResourceProperties.ImageVersion,
          productCode: event.ResourceProperties.ImageProductCode,
        }),
      )
      .promise(),
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
}): AWS.EC2.DescribeImagesRequest {
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
