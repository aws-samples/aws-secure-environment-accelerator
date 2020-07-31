import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import { HandlerProperties } from '@custom-resources/macie-enable-admin-lambda';

const resourceType = 'Custom::MacieAdmin';

export interface MacieEnableAdminProps {
  accountId: string;
  roleArn: string;
}

export class MacieEnableAdmin extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: MacieEnableAdminProps) {
    super(scope, id);
    const handlerProperties: HandlerProperties = {
      accountId: props.accountId,
    };

    const enableMacieAdmin = this.lambdaFunction(props.roleArn);

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: enableMacieAdmin.functionArn,
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

    const lambdaPath = require.resolve('@custom-resources/macie-enable-admin-lambda');
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
