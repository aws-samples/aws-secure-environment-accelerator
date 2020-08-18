import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../../common/account-stacks';
import { Account } from '../../../utils/accounts';
import { StackOutput, getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { CentralLoggingSubscriptionFilter } from '@aws-accelerator/custom-resource-logs-add-subscription-filter';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';

export interface CentralLoggingToS3Step2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 * Creating Subscription Filters for handling CloudWatch Celtral Logging to S3 in log-archive account
 * Good to have in last phase, since we add subscription filter to all log groups
 * TODO - Create CloudWatch Event in all account for create LogGroup
 */
export async function step2(props: CentralLoggingToS3Step2Props) {
  const { accountStacks, config, outputs } = props;

  const globalOptionsConfig = config['global-options'];
  const defaultLogRetention = globalOptionsConfig['default-cwl-retention'];
  const accountConfigs = config.getAccountConfigs();
  const logConfig = globalOptionsConfig['central-log-services'];
  const logArchiveAccountKey = logConfig.account;
  const logDestinationOutput = getStackJsonOutput(outputs, {
    accountKey: logArchiveAccountKey,
    outputType: 'CloudWatchCentralLogging',
  });
  if (!logDestinationOutput || logDestinationOutput.length === 0) {
    console.log(`Log Dstination not found in outputs ${logArchiveAccountKey}`);
    return;
  }
  const logDestinationArn = logDestinationOutput[0].logDestination;
  for (const [accountKey, accountConfig] of accountConfigs) {
    const logRetention = accountConfig['cwl-retention'] || defaultLogRetention;
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
    } else {
      const accountSpecificExclusions = [
        ...(logConfig['cwl-exclusions']?.find(e => e.account === accountKey)?.exclusions || []),
      ];
      const globalExclusions = [...(logConfig['cwl-glbl-exclusions'] || []), ...accountSpecificExclusions];
      const ruleName = createName({
        name: 'NewLogGroup_rule',
        account: false,
        region: false,
      });
      new CentralLoggingSubscriptionFilter(accountStack, `CentralLoggingSubscriptionFilter-${accountKey}`, {
        logDestinationArn,
        globalExclusions,
        ruleName,
        logRetention,
      });
    }
  }
}
