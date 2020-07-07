import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@custom-resources/macie-enable-admin-lambda';

export interface MacieEnableAdminProps {
  accountId: string;
  clientToken?: string;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class MacieEnableAdmin extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieEnableAdminProps) {
    super(scope, id);
    const handlerProperties: HandlerProperties = {
      accountId: props.accountId,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::MacieAdmin',
      serviceToken: this.lambdaFunction.functionArn,
      properties: handlerProperties,
    });
  }

  private get lambdaFunction(): lambda.Function {
    const constructName = `MacieAdminLambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@custom-resources/macie-enable-admin-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${constructName}Role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['organizations:*'],
        resources: ['*'],
      }),
    );
    role.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['macie2:EnableOrganizationAdminAccount'],
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
