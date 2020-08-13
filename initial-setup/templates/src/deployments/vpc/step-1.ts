// TODO Move VPC code over from phase-1.ts
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountBuckets } from '../defaults';
import { Account } from '../../utils/accounts';
import * as s3 from '@aws-cdk/aws-s3';
import { FlowLogContainer } from '../../common/flow-log-container';
import { createIamRoleOutput } from '../iam';
import { NONE_DESTINATION_TYPE, S3_DESTINATION_TYPE } from './outputs';

export interface VpcStep1Props {
  accountBuckets: AccountBuckets;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  accounts: Account[];
}

export async function step1(props: VpcStep1Props) {
  createFlowLogRoles(props);
}

function createFlowLogRoles(props: VpcStep1Props) {
  const { accountBuckets, accountStacks, config, accounts } = props;
  for (const account of accounts) {
    const accountVpcs = config
      .getVpcConfigs()
      .filter(a => a.accountKey === account.key && a.vpcConfig['flow-logs'] !== NONE_DESTINATION_TYPE);
    if (accountVpcs.length === 0) {
      continue;
    }

    const flowLogS3Vpcs = accountVpcs
      .filter(v => v.vpcConfig['flow-logs'] === S3_DESTINATION_TYPE)
      .map(a => a.vpcConfig.name);

    const accountStack = accountStacks.tryGetOrCreateAccountStack(account.key);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${account.key}`);
      continue;
    }

    const accountBucket = accountBuckets[account.key];
    if (!accountBucket) {
      console.warn(`Cannot find account bucket ${accountStack.accountKey}`);
      continue;
    }

    const flowLogContainer = getOrCreateFlowLogContainer(accountBucket, accountStack, flowLogS3Vpcs);
    if (!flowLogContainer) {
      continue;
    }
    createIamRoleOutput(accountStack, flowLogContainer.role, 'FlowLogRole');
  }

  /**
   * Auxiliary method that gets or creates the flow log container in the given account stack.
   */
  function getOrCreateFlowLogContainer(
    accountBucket: s3.IBucket,
    accountStack: AccountStack,
    vpcNames: string[],
  ): FlowLogContainer | undefined {
    const flowLogContainer = accountStack.node.tryFindChild(`FlowLogContainer`);
    if (flowLogContainer) {
      return flowLogContainer as FlowLogContainer;
    }
    return new FlowLogContainer(accountStack, `FlowLogContainer`, {
      bucket: accountBucket,
      vpcNames,
    });
  }
}
