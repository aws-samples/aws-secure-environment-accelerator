import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';

const resourceType = 'Custom::EC2ImageFinder';

export interface ImageFinderProps {
  imageOwner: string;
  imageName?: string;
  imageVersion?: string;
  imageProductCode?: string;
}

/**
 * Custom resource that has an image ID attribute for the image with the given properties.
 */
export class ImageFinder extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: ImageFinderProps) {
    super(scope, id);

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-ec2-image-finder-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['ec2:DescribeImages'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: {
        ImageOwner: props.imageOwner,
        ImageName: props.imageName,
        ImageVersion: props.imageVersion,
        ImageProductCode: props.imageProductCode,
      },
    });
  }

  get imageId(): string {
    return this.resource.getAttString('ImageID');
  }
}
