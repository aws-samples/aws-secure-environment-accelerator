import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::CentralLoggingSubscriptionFilter';

export interface CentralLoggingSubscriptionFilterProps {
  logDestinationArn: string;
  globalExclusions?: string[];
}

/**
 * Custom resource to create subscription filter in all existing log groups
 */
export class CentralLoggingSubscriptionFilter extends cdk.Construct {
  private readonly resource: cdk.CustomResource;
  constructor(scope: cdk.Construct, id: string, props: CentralLoggingSubscriptionFilterProps) {
    super(scope, id);

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: this.lambdaFunction.functionArn,
      properties: {
        ...props,
      },
    });
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

    const lambdaPath = require.resolve('@custom-resources/logs-add-subscription-filter-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:*'],
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
