import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@custom-resources/ec2-marketplace-subscription-validation-lambda';

const resourceType = 'Custom::MarketPlaceSubscriptionCheck';

export interface Ec2MarketPlaceSubscriptionCheckProps {
  imageId: string;
  subnetId: string;
  instanceType?: string;
}

export type Attribute = 'Status';

/**
 * Custom resource that has an image ID attribute for the image with the given properties.
 */
export class Ec2MarketPlaceSubscriptionCheck extends cdk.Construct {
  private readonly resource: cdk.CustomResource;
  constructor(scope: cdk.Construct, id: string, props: Ec2MarketPlaceSubscriptionCheckProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      imageId: props.imageId,
      subnetId: props.subnetId,
      instanceType: props.instanceType,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...handlerProperties,
        // Add a dummy value that is a random number to update the resource every time
        forceUpdate: Math.round(Math.random() * 1000000),
      },
    });
  }

  /**
   * Returns the given CloudFormation attribute.
   */
  get status(): string {
    return this.resource.getAttString('Status');
  }

  get lambdaFunction(): lambda.Function {
    return this.ensureLambdaFunction();
  }

  get role(): iam.IRole {
    return this.lambdaFunction.role!;
  }

  private ensureLambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/ec2-marketplace-subscription-validation-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'ec2:RunInstances'],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      // Set timeout to maximum timeout
      timeout: cdk.Duration.minutes(15),
    });
  }
}
