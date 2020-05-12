import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

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
  private readonly resource: cfn.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: ImageFinderProps) {
    super(scope, id);

    // Create CfnCustom Resource to get IPs which are alloted to InBound Endpoint
    this.resource = new cfn.CustomResource(this, 'Resource', {
      provider: cfn.CustomResourceProvider.fromLambda(this.ensureLambda()),
      properties: {
        ImageOwner: props.imageOwner,
        ImageName: props.imageName,
        ImageVersion: props.imageVersion,
        ImageProductCode: props.imageProductCode,
      },
    });
  }

  private ensureLambda(): lambda.Function {
    const constructName = 'ImageFinderFunction';

    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const imageFinderRole = new iam.Role(stack, 'ImageFinderRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Grant permissions to write logs
    imageFinderRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    imageFinderRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ec2:DescribeImages'],
        resources: ['*'],
      }),
    );

    const lambdaPath = require.resolve('@custom-resources/image-finder-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: imageFinderRole,
    });
  }

  get imageId(): string {
    return this.resource.getAttString('ImageID');
  }
}
