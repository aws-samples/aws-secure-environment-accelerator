import * as cdk from '@aws-cdk/core';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as lambda from '@aws-cdk/aws-lambda';

export interface ImageFinderProps {
  functionArn: string;
  imageOwner: string;
  imageName?: string;
  imageVersion?: string;
  imageProductCode?: string;
}

/**
 * Custom resource that has an image ID attribute for the image with the given properties.
 */
export class ImageFinder extends cdk.Construct {
  private readonly resource: cfn.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: ImageFinderProps) {
    super(scope, id);

    const finderFunc = lambda.Function.fromFunctionArn(this, 'FinderFunc', props.functionArn);

    // Create CfnCustom Resource to get IPs which are alloted to InBound Endpoint
    this.resource = new cfn.CustomResource(this, 'Resource', {
      provider: cfn.CustomResourceProvider.fromLambda(finderFunc),
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
