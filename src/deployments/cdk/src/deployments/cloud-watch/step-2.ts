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
import * as cdk from '@aws-cdk/core';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import { Account, getAccountId } from '@aws-accelerator/common-outputs/src/accounts';
import { createName, createSnsTopicName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';

export interface CloudWatchStep2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
}

export async function step2(props: CloudWatchStep2Props) {
  const { accountStacks, config, accounts } = props;
  const globalOptions = config['global-options'];
  const centralLogServices = globalOptions['central-log-services'];
  if (!globalOptions.cloudwatch) {
    console.log(`No Configuration defined for CloudWatch Deployment`);
    return;
  }
  const managementAccount = config['global-options']['aws-org-management'].account;
  const managementRegion = config['global-options']['aws-org-management'].region;
  const alarmsConfig = globalOptions.cloudwatch.alarms;
  const alarmDefaultDefinition: c.CloudWatchDefaultAlarmDefinition = alarmsConfig;
  if (alarmDefaultDefinition['default-accounts'].includes('ALL')) {
    alarmDefaultDefinition['default-accounts'] = accounts.map(account => account.key);
  }
  for (const alarmconfig of alarmsConfig.definitions) {
    const accountKeys: string[] = [];
    const regions: string[] = [];
    if (alarmconfig.accounts?.includes('ALL')) {
      alarmconfig.accounts = accounts.map(account => account.key);
    }

    accountKeys.push(...(alarmconfig.accounts || alarmDefaultDefinition['default-accounts']));
    regions.push(...(alarmconfig.regions || alarmDefaultDefinition['default-regions']));
    for (const accountKey of accountKeys) {
      console.log('REGIONS: ', JSON.stringify(regions, null, 4));
      for (const region of regions) {
        const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
        if (!accountStack) {
          console.error(`Cannot find account stack ${accountKey}: ${region}, while deploying CloudWatch Alarm`);
          continue;
        }
        new cloudwatch.CfnAlarm(accountStack, `CloudAlarm${alarmconfig['alarm-name']}`, {
          alarmDescription: alarmconfig['alarm-description'],
          alarmName: createName({
            name: alarmconfig['alarm-name'],
            suffixLength: 0,
          }),
          metricName: alarmconfig['metric-name'],
          evaluationPeriods: alarmconfig['evaluation-periods'] || alarmDefaultDefinition['default-evaluation-periods'],
          comparisonOperator:
            alarmconfig['comparison-operator'] || alarmDefaultDefinition['default-comparison-operator'],
          namespace: alarmconfig.namespace || alarmDefaultDefinition['default-namespace'],
          statistic: alarmconfig.statistic || alarmDefaultDefinition['default-statistic'],
          period: alarmconfig.period || alarmDefaultDefinition['default-period'],
          treatMissingData: alarmconfig['treat-missing-data'] || alarmDefaultDefinition['default-treat-missing-data'],
          threshold: alarmconfig.threshold || alarmDefaultDefinition['default-threshold'],
          alarmActions: [
            accountKey === managementAccount &&
            region === managementRegion &&
            (alarmconfig['in-org-mgmt-use-lcl-sns'] === true ||
              alarmDefaultDefinition['default-in-org-mgmt-use-lcl-sns'])
              ? `arn:aws:sns:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:${createSnsTopicName(
                  alarmconfig['sns-alert-level'],
                )}`
              : `arn:aws:sns:${cdk.Aws.REGION}:${getAccountId(
                  accounts,
                  centralLogServices.account,
                )}:${createSnsTopicName(alarmconfig['sns-alert-level'])}`,
          ],
        });
      }
    }
  }
}
