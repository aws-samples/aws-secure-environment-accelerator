import * as sdk from 'aws-sdk';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { send, SUCCESS, FAILED } from 'cfn-response-async';

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context): Promise<unknown> => {
  console.log(`Finding image ID...`);
  console.log(JSON.stringify(event, null, 2));

  const resourceId = 'ImageIdFinder';
  const requestType = event.RequestType;
  if (requestType === 'Delete') {
    console.log('Nothing to perform to delete this resource');
    return send(event, context, SUCCESS, {}, resourceId);
  }

  try {
    const ec2 = new sdk.EC2();

    // Find images that match the given owner, name and version
    const describeImages = await ec2
      .describeImages(
        buildRequest({
          owner: event.ResourceProperties.ImageOwner,
          name: event.ResourceProperties.ImageName,
          version: event.ResourceProperties.ImageVersion,
          productCode: event.ResourceProperties.ImageProductCode,
        }),
      )
      .promise();

    const images = describeImages.Images;
    if (!images || images.length === 0) {
      throw new Error(`Unable to find image`);
    }

    // Reverse sort by creation date
    images.sort((a: sdk.EC2.Image, b: sdk.EC2.Image) => b.CreationDate!.localeCompare(a.CreationDate!));

    // Build the resource output
    const image = images[0];
    const output = {
      ImageID: image.ImageId,
    };

    return send(event, context, SUCCESS, output, resourceId);
  } catch (error) {
    console.error(error);

    return send(
      event,
      context,
      FAILED,
      {
        status: 'FAILED',
        statusReason: JSON.stringify(error),
      },
      resourceId,
    );
  }
};

/**
 * Auxiliary method to build a DescribeImagesRequest from the given parameters.
 */
function buildRequest(props: {
  owner?: string;
  name?: string;
  version?: string;
  productCode: string;
}): sdk.EC2.DescribeImagesRequest {
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
