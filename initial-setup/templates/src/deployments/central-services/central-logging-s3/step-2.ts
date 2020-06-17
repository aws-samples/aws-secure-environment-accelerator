import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../../common/account-stacks';
import { Account } from '../../../utils/accounts';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { CentralLoggingSubscriptionFilter } from '@custom-resources/logs-add-subscription-filter';

export interface CentralLoggingToS3Step2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  accounts: Account[];
  outputs: StackOutput[];
}

/**
 * Creating Subscription Filters for handling CloudWatch Celtral Logging to S3 in log-archive account
 * Good to have in last phase, since we add subscription filter to all log groups
 * TODO - Create CloudWatch Event in all account for create LogGroup
 */
export async function step2(props: CentralLoggingToS3Step2Props) {
  const { accountStacks, config, accounts, outputs } = props;

  const globalOptionsConfig = config['global-options'];
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
  for (const account of accounts) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${account.key}`);
    } else {
      const accountSpecificExclusions = [
        ...(logConfig['cwl-exclusions']?.find(e => e.account === account.key)?.exclusions || []),
      ];
      const globalExclusions = [...(logConfig['cwl-glbl-exclusions'] || []), ...accountSpecificExclusions];
      new CentralLoggingSubscriptionFilter(accountStack, `CentralLoggingSubscriptionFilter-${account.key}`, {
        logDestinationArn,
        globalExclusions,
      });
    }
  }
}
