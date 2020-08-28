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
  const alarmsConfig = globalOptions.cloudwatch.alarms;
  const alarmDefaultDefinition: c.CloudWatchDefaultAlarmDefinition = alarmsConfig;
  for (const alarmconfig of alarmsConfig.definitions) {
    const accountKeys: string[] = [];
    const regions: string[] = [];
    if (alarmconfig.accounts && alarmconfig.accounts.includes('ALL')) {
      // Ignore for now implementation will come in phase 2
    } else {
      accountKeys.push(...(alarmconfig.accounts || alarmDefaultDefinition['default-accounts']));
    }

    if (alarmconfig.regions && alarmconfig.regions.includes('ALL')) {
      // Ignore for now implementation will come in phase 2
    } else {
      regions.push(...(alarmconfig.regions || alarmDefaultDefinition['default-regions']));
    }
    for (const accountKey of accountKeys) {
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
            `arn:aws:sns:${cdk.Aws.REGION}:${getAccountId(accounts, centralLogServices.account)}:${createSnsTopicName(
              alarmconfig['sns-alert-level'],
            )}`,
          ],
        });
      }
    }
  }
}
