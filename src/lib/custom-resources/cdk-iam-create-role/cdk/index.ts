import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::IAMCreateRole';

export interface IamCreateRoleProperties {
  roleName: string;
  accountIds: string[];
  managedPolicies: string[];
  tagName: string;
  tagValue: string;
  lambdaRoleArn: string;
}

/**
 * Custom resource implementation that creates IAM role
 */
export class IamCreateRole extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: IamCreateRoleProperties) {
    super(scope, id);

    const { roleName, accountIds, managedPolicies, tagName, tagValue, lambdaRoleArn } = props;

    const createRole = this.lambdaFunction(lambdaRoleArn);
    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: createRole.functionArn,
      properties: {
        roleName,
        accountIds,
        managedPolicies,
        tagName,
        tagValue,
      },
    });
  }

  private lambdaFunction(roleArn: string): lambda.Function {
    const constructName = `${resourceType}Lambda`;
    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-iam-create-role-runtime');
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
