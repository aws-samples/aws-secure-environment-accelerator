/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { LogsMetricFilter } from '@aws-accelerator/custom-resource-logs-metric-filter';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';

export interface CloudWatchStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  accounts: Account[];
}

export async function step1(props: CloudWatchStep1Props) {
  const { accountStacks, config, outputs, accounts } = props;
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
      accountKeys.push(...accounts.map(acc => acc.key));
    } else {
      accountKeys.push(...metricConfig.accounts);
    }

    if (metricConfig.regions && metricConfig.regions.includes('ALL')) {
      regions.push(...config['global-options']['supported-regions']);
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
