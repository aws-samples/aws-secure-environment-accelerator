import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

const resourceType = 'Custom::GuardDutyAdminSetup';

export interface AccountDetail {
  AccountId: string;
  Email: string;
}

export interface GuardDutyAdminSetupProps {
  memberAccounts: AccountDetail[];
  roleArn: string;
  s3Protection: boolean;
}

/**
 * Custom resource implementation that does initial admin account setup for Guard Duty
 * Step 2 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 * Step 3 of https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_organizations.html
 */
export class GuardDutyAdminSetup extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: GuardDutyAdminSetupProps) {
    super(scope, id);

    const handlerProperties = {
      memberAccounts: props.memberAccounts,
      s3Protection: props.s3Protection,
    };

    const adminSetup = this.lambdaFunction(props.roleArn);
    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: adminSetup.functionArn,
      properties: {
        ...handlerProperties,
        // Add a dummy value that is a random number to update the resource every time
        forceUpdate: Math.round(Math.random() * 1000000),
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

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-guardduty-admin-setup-runtime');
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
