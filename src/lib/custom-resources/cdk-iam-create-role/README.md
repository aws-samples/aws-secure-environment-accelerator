# IAM set/update password policy

This is a custom resource to create the iam role using the `createRole` and `attachRolePolicy` API calls.

## Usage

    import { IamCreateRole } from '@aws-accelerator/custom-resource-iam-create-role';

    const roleName = ...;
    const accountIds = ...;
    const managedPolicies = ...;
    const tagName = ...;
    const tagValue = ...;
    const lambdaRoleArn = ...;

    new IamCreateRole(this, 'IamCreateRole', {
      roleName,
      accountIds,
      managedPolicies,
      tagName,
      tagValue,
      lambdaRoleArn,
    });
