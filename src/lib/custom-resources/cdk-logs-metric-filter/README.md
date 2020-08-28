# Create Metric Filter for Log Group

This is a custom resource to create Metric filter to log group if log group exists
`describeLogGroups`, `putMetricFilter` and `deleteMetricFilter` API calls.

## Usage

    import { LogsMetricFilter } from '@aws-accelerator/custom-resource-logs-metric-filter';

    new LogsMetricFilter(accountStack, `LogGroupMetricFilter`, {
      roleArn: `<string>`,
      defaultValue: <number>,
      metricValue: `<string>`,
      filterPattern: `<string>`,
      metricName: `<string>`,
      metricNamespace: `<string>`,
      filterName: `<string>`,
      logGroupName: `<string>`,
    });

## Input Example

    {
      roleArn: metricFilterRole.roleArn,
      defaultValue: metricConfig['default-value'],
      metricValue: metricConfig['metric-value'],
      filterPattern: metricConfig['filter-pattern'].trim(),
      metricName: metricConfig['metric-name'],
      metricNamespace: metricConfig['metric-namespace'],
      filterName: createName({
        name: metricConfig['filter-name'],
        suffixLength: 0,
      }),
      logGroupName: metricConfig['loggroup-name'],
    }
