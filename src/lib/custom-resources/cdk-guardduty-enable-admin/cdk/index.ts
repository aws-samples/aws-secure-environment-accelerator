import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@aws-accelerator/custom-resource-guardduty-enable-admin-runtime';

const resourceType = 'Custom::GuardDutyAdmin';

export interface GuardDutyAdminProps {
  accountId: string;
  roleArn: string;
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

    const guardDutyAdmin = this.lambdaFunction(props.roleArn);
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: guardDutyAdmin.functionArn,
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-guardduty-enable-admin-runtime');
    const lambdaDir = path.dirname(lambdaPath);
    const role = iam.Role.fromRoleArn(stack, `${resourceType}Role`, roleArn);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role,
      timeout: cdk.Duration.minutes(10),
      deadLetterQueueEnabled: true,
    });
  }
}
