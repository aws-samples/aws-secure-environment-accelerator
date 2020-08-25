import * as c from '@aws-accelerator/common-config';
import { AccountStacks } from '../../common/account-stacks';
import * as sns from '@aws-cdk/aws-sns';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { CfnSnsTopicOutput } from './outputs';
import { createSnsTopicName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { SNS_NOTIFICATION_TYPES } from '@aws-accelerator/common/src/util/constants';

export interface SnsStep2Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

/**
 *
 *  Create SNS Topics High, Medium, Low, Ignore
 *  in Central-Log-Services Account
 */
export async function step2(props: SnsStep2Props) {
  const { accountStacks, config } = props;
  const globalOptions = config['global-options'];
  const centralLogServices = globalOptions['central-log-services'];
  const supportedRegions = globalOptions['supported-regions'];
  const excludeRegions = centralLogServices['sns-excl-regions'];
  const regions = supportedRegions.filter(r => !excludeRegions?.includes(r));
  if (!regions.includes(centralLogServices.region)) {
    regions.push(centralLogServices.region);
  }
}
