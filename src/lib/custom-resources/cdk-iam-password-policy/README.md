# IAM set/update password policy

This is a custom resource to set/update the iam password policy of each account using the `updateAccountPasswordPolicy` API call.

## Usage

    import { IamPasswordPolicy } from '@aws-accelerator/custom-resource-iam-password-policy';

    const allowUsersToChangePassword = ...;
    const hardExpiry = ...;
    const requireUppercaseCharacters = ...;
    const requireLowercaseCharacters = ...;
    const requireSymbols = ...;
    const requireNumbers = ...;
    const minimumPasswordLength = ...;
    const passwordReusePrevention = ...;
    const maxPasswordAge = ...;

    new IamPasswordPolicy(this, 'IamPasswordPolicy', {
      allowUsersToChangePassword,
      hardExpiry,
      requireUppercaseCharacters,
      requireLowercaseCharacters,
      requireSymbols,
      requireNumbers,
      minimumPasswordLength,
      passwordReusePrevention,
      maxPasswordAge,
    });
