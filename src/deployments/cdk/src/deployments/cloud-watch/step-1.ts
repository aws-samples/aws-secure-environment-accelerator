import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { LogsMetricFilter } from '@aws-accelerator/custom-resource-logs-metric-filter';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
export interface CloudWatchStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

export async function step1(props: CloudWatchStep1Props) {
  const { accountStacks, config, outputs } = props;
  const globalOptions = config['global-options'];
  if (!globalOptions.cloudwatch) {
    console.log(`No Configuration defined for CloudWatch Deployment`);
    return;
  }
  const metricsConfig = globalOptions.cloudwatch.metrics;
  metricsConfig.forEach((metricConfig, _) => {
    const accountKeys: string[] = [];
    const regions: string[] = [];
    if (metricConfig.accounts && metricConfig.accounts.includes('ALL')) {
      // Ignore for now implementation will come in phase 2
    } else {
      accountKeys.push(...metricConfig.accounts);
    }

    if (metricConfig.regions && metricConfig.regions.includes('ALL')) {
      // Ignore for now implementation will come in phase 2
    } else {
      regions.push(...metricConfig.regions);
    }
    for (const accountKey of accountKeys) {
      const metricFilterRole = IamRoleOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        roleKey: 'LogsMetricFilterRole',
      });
      if (!metricFilterRole) {
        console.error(`Role is not created for LogsMetricFilter CustomResource in account: ${accountKey}`);
        continue;
      }
      for (const region of regions) {
        const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
        if (!accountStack) {
          console.error(`Cannot find account stack ${accountKey}: ${region}, while deploying CloudWatch Metric Filter`);
          continue;
        }
        new LogsMetricFilter(accountStack, `LogGroupMetricFilter${metricConfig['metric-name']}`, {
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
        });
      }
    }
  });
}
