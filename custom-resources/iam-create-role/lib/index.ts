import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';

const resourceType = 'Custom::IAMCreateRole';

export interface PasswordPolicyProperties {
  roleName: string;
  accountIds: string[];
  managedPolicies: string[];
  tagName: string;
  tagValue: string;
}

/**
 * Custom resource implementation that creates IAM role
 */
export class IamCreateRole extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: PasswordPolicyProperties) {
    super(scope, id);

    const { roleName, accountIds, managedPolicies, tagName, tagValue } = props;

    const lambdaPath = require.resolve('@custom-resources/iam-create-role-lambda');
    const lambdaDir = path.dirname(lambdaPath);
    const stack = cdk.Stack.of(this);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['iam:GetRole', 'iam:CreateRole', 'iam:AttachRolePolicy', 'iam:TagRole'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: {
        roleName,
        accountIds,
        managedPolicies,
        tagName,
        tagValue,
      },
    });
  }
}
