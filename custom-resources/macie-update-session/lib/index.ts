import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@custom-resources/macie-update-session-lambda';
import { MacieFrequency, MacieStatus } from '@custom-resources/macie-enable-lambda';

const resourceType = 'Custom::MacieUpdateSession';

export interface MacieUpdateSessionProps {
  findingPublishingFrequency: MacieFrequency;
  status: MacieStatus;
  roleArn: string;
}
/**
 * Custom resource implementation that turn on auto enable for Macie
 */
export class MacieUpdateSession extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieUpdateSessionProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = props;
    const updateSession = this.lambdaFunction(props.roleArn);

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: updateSession.functionArn,
      properties: handlerProperties,
    });
  }

  private lambdaFunction(roleArn: string): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/macie-update-session-lambda');
    const lambdaDir = path.dirname(lambdaPath);
    const role = iam.Role.fromRoleArn(stack, `${resourceType}Role`, roleArn);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(10),
    });
  }
}
