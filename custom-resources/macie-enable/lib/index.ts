import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties, MacieFrequency, MacieStatus } from '@custom-resources/macie-enable-lambda';

const resourceType = 'Custom::MacieEnable';

export interface MacieEnableProps {
  findingPublishingFrequency: MacieFrequency;
  status: MacieStatus;
  clientToken?: string;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class MacieEnable extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieEnableProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = props;

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/macie-enable-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['iam:CreateServiceLinkedRole'],
        resources: ['*'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['macie2:EnableMacie'],
        resources: ['*'],
      }),
    );

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.seconds(10),
    });
  }
}
