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

// TODO Move VPC code over from phase-1.ts
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { AccountBuckets } from '../defaults';
import { Account } from '../../utils/accounts';
import * as s3 from '@aws-cdk/aws-s3';
import { FlowLogContainer } from '../../common/flow-log-container';
import { createIamRoleOutput } from '../iam';
import { NONE_DESTINATION_TYPE, CWL_DESTINATION_TYPE } from './outputs';

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
      .filter(v => v.vpcConfig['flow-logs'] !== CWL_DESTINATION_TYPE)
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
