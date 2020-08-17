import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';

const resourceType = 'Custom::IAMPasswordPolicy';

export interface PasswordPolicyProperties {
  allowUsersToChangePassword: boolean;
  hardExpiry: boolean;
  requireUppercaseCharacters: boolean;
  requireLowercaseCharacters: boolean;
  requireSymbols: boolean;
  requireNumbers: boolean;
  minimumPasswordLength: number;
  passwordReusePrevention: number;
  maxPasswordAge: number;
}

/**
 * Custom resource implementation that set/update IAM account password policy
 */
export class IamPasswordPolicy extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: PasswordPolicyProperties) {
    super(scope, id);

    const {
      allowUsersToChangePassword,
      hardExpiry,
      requireUppercaseCharacters,
      requireLowercaseCharacters,
      requireSymbols,
      requireNumbers,
      minimumPasswordLength,
      passwordReusePrevention,
      maxPasswordAge,
    } = props;

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-iam-password-policy-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['iam:UpdateAccountPasswordPolicy'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: {
        allowUsersToChangePassword,
        hardExpiry,
        requireUppercaseCharacters,
        requireLowercaseCharacters,
        requireSymbols,
        requireNumbers,
        minimumPasswordLength,
        passwordReusePrevention,
        maxPasswordAge,
      },
    });
  }
}
