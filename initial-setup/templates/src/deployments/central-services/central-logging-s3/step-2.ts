import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import * as iam from '@aws-cdk/aws-iam';
import { createRoleName, createBucketName, createName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as s3 from '@aws-cdk/aws-s3';
import * as logs from '@aws-cdk/aws-logs';
import * as kinesisfirehose from '@aws-cdk/aws-kinesisfirehose';
import { AccountStacks } from '../../../common/account-stacks';
import { Account } from '../../../utils/accounts';
import { JsonOutputValue } from '../../../common/json-output';
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
  const logConfig = globalOptionsConfig["central-log-services"];
  const globalExclusions = logConfig["cwl-glbl-exclusions"];
  const logArchiveAccountKey = logConfig.account;
  const LogDestinationOutput = getStackJsonOutput(outputs, {
    accountKey: logArchiveAccountKey,
    outputType: 'CloudWatchCentralLogging',
  });
  if (!LogDestinationOutput) {
    console.log(`Log Dstination not found in outputs ${logArchiveAccountKey}`);
    return;
  }
  const logDestinationArn = LogDestinationOutput[0].logDestination;
  for (const account of accounts) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${account.key}`);
    } else {
      console.log(globalExclusions);
      globalExclusions?.push(...logConfig['cwl-exclusions']?.find(e => e.account === account.key)?.exclusions || []);
      console.log(globalExclusions);
      new CentralLoggingSubscriptionFilter(accountStack, `CentralLoggingSubscriptionFilter`, {
        logDestinationArn,
        globalExclusions
      });
    }
  }
}
