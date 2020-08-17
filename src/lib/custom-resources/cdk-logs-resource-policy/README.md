# CloudWatch Resource Policy

This is a custom resource to create a log resource policy using the CloudWatch `PutResourcePolicy` API call.

## Usage

    import { LogResourcePolicy } from '@aws-accelerator/custom-resource-logs-resource-policy';

    const logGroup = ...;

    new LogResourcePolicy(this, 'LogGroupPolicy', {
      policyName: 'DsLogSubscription',
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          principals: [new iam.ServicePrincipal('ds.amazonaws.com')],
          resources: [logGroup.logGroupArn],
        }),
      ],
    });

## To-do

Some improvements can still be made to this resource.

- We will end up without log resource policy when we create two `LogResourcePolicy` with the same name and then
delete one of both.
