import * as cdk from '@aws-cdk/core';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as lambda from '@aws-cdk/aws-lambda';
import { FortiGateImageType } from './fortigate';

export interface FortiGateImageFinderProps {
  fortiGateImageType: FortiGateImageType;
  fortiGateImageVersion: string;
  fortiGateImageFinderFunctionArn: string;
}

export class FortiGateImageFinder extends cdk.Construct {
  private readonly resource: cfn.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: FortiGateImageFinderProps) {
    super(scope, id);

    const finderFunc = lambda.Function.fromFunctionArn(
      this,
      'CfnFortiGateImageFinder',
      props.fortiGateImageFinderFunctionArn,
    );

    // Create CfnCustom Resource to get IPs which are alloted to InBound Endpoint
    this.resource = new cfn.CustomResource(this, 'Resource', {
      provider: cfn.CustomResourceProvider.fromLambda(finderFunc),
      properties: {
        ImageName: 'FortiGate-VM64-AWSONDEMAND', // TODO From version
        ImageVersion: props.fortiGateImageVersion,
      },
    });
  }

  get imageId(): string {
    return this.resource.getAttString('ImageID');
  }
}
