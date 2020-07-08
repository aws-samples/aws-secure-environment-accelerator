import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@custom-resources/guardduty-enable-admin-lambda';

const resourceType = 'Custom::GuardDutyAdmin';

export interface GuardDutyAdminProps {
  accountId: string;
}
/**
 * Custom resource implementation that enable admin for Guard Duty
 */
export class GuardDutyAdmin extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyAdminProps) {
    super(scope, id);

    const handlerProperties: HandlerProperties = {
      accountId: props.accountId,
    };

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

    const lambdaPath = require.resolve('@custom-resources/guardduty-enable-admin-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    const role = new iam.Role(stack, `${resourceType}Role`, {
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
        actions: ['guardduty:EnableOrganizationAdminAccount'],
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
