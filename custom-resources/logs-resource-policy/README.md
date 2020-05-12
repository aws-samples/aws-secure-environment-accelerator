# CloudWatch Resource Policy

This is a custom resource to creating a log resource policy using the CloudWatch `PutResourcePolicy` API call.

## Usage

    import { LogResourcePolicy } from '@custom-resources/logs-resource-policy';

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
