import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../../common/account-stacks';
import { StackOutput, getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { CentralLoggingSubscriptionFilter } from '@aws-accelerator/custom-resource-logs-add-subscription-filter';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { LogDestinationOutputFinder } from '@aws-accelerator/common-outputs/src/log-destination';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';

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
  const centralLogServices = globalOptionsConfig['central-log-services'];
  const cwlRegions = Object.entries(globalOptionsConfig['additional-cwl-regions']).map(([region, _]) => region);
  if (!cwlRegions.includes(centralLogServices.region)) {
    cwlRegions.push(centralLogServices.region);
  }

  for (const [accountKey, accountConfig] of accountConfigs) {
    const logRetention = accountConfig['cwl-retention'] || defaultLogRetention;
    const subscriptionRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      accountKey,
      outputs,
      roleKey: 'CWLAddSubscriptionFilter',
    });
    if (!subscriptionRoleOutput) {
      console.error(`Can't find "CWLAddSubscriptionFilter" Role in account ${accountKey} outputs`);
      continue;
    }
    for (const region of cwlRegions) {
      const logDestinationOutput = LogDestinationOutputFinder.tryFindOneByName({
        outputs,
        accountKey: centralLogServices.account,
        region,
        destinationKey: 'CwlCentralLogDestination',
      });
      if (!logDestinationOutput) {
        console.warn(`Cannot find required LogDestination in account "${accountKey}:${region}"`);
        continue;
      }
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
      if (!accountStack) {
        console.error(
          `Cannot find account stack ${accountKey}:${region} while adding subscription filter for CWL Central logging`,
        );
        continue;
      }
      const accountSpecificExclusions = [
        ...(centralLogServices['cwl-exclusions']?.find(e => e.account === accountKey)?.exclusions || []),
      ];
      const globalExclusions = [...(centralLogServices['cwl-glbl-exclusions'] || []), ...accountSpecificExclusions];
      const ruleName = createName({
        name: 'NewLogGroup_rule',
        account: false,
        region: false,
      });
      new CentralLoggingSubscriptionFilter(accountStack, `CentralLoggingSubscriptionFilter-${accountKey}`, {
        logDestinationArn: logDestinationOutput.destinationArn,
        globalExclusions,
        ruleName,
        logRetention,
        roleArn: subscriptionRoleOutput.roleArn,
      });
    }
  }
}
