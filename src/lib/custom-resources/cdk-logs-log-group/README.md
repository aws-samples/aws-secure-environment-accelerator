# CloudWatch Log Group

This is a custom resource to create a log group using the CloudWatch `CreateLogGroup` API call. The difference with the
built-in `Logs::LogGroup` resource is that this resource succeeds when the log group already exists.

## Usage

    import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';

    new LogGroup(this, 'LogGroup', {
      logGroupName: 'MicrosoftAD',
      retention: 1,
    });
