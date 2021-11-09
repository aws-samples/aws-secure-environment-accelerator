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

import { AccountStacks } from '../../common/account-stacks';
import { VpcConfig } from '@aws-accelerator/common-config';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import { createLogGroupName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnResolverQueryLoggingConfig, CfnResolverQueryLoggingConfigAssociation } from '@aws-cdk/aws-route53resolver';

export interface VpcStep4Props {
  vpcConfig: VpcConfig;
  vpcId: string;
  accountKey: string;
  accountStacks: AccountStacks;
  outputs: StackOutput[];
  acceleratorPrefix: string;
}

export async function step4(props: VpcStep4Props) {
  createVpcDnsQueryLogging(props);
}

function createVpcDnsQueryLogging(props: VpcStep4Props) {
  const { vpcConfig, vpcId, accountStacks, accountKey, outputs, acceleratorPrefix } = props;

  if (!vpcConfig['dns-resolver-logging']) {
    return;
  }

  const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey,
    roleKey: 'LogGroupRole',
  });
  if (!logGroupLambdaRoleOutput) {
    console.warn(`Cannot find LogGroupRole, skipping creation of DNS Query Logging for VPC ${vpcConfig.name}`);
    return;
  }

  const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
  if (!accountStack) {
    console.warn(`Cannot find account stack ${accountKey}`);
    return;
  }

  const logGroup = new LogGroup(accountStack, `LogGroup${accountStack}${vpcConfig.name}`, {
    logGroupName: createLogGroupName(`rql/${vpcConfig.name}-${vpcId}`, 0),
    roleArn: logGroupLambdaRoleOutput.roleArn,
  });

  const queryLoggingConfig = new CfnResolverQueryLoggingConfig(accountStack, `Rql${vpcConfig.name}`, {
    destinationArn: logGroup.logGroupArn,
    name: `${acceleratorPrefix}rql-${vpcConfig.name}`,
  });

  new CfnResolverQueryLoggingConfigAssociation(accountStack, `RqlAssoc${vpcConfig.name}`, {
    resolverQueryLogConfigId: queryLoggingConfig.ref,
    resourceId: vpcId,
  });
}
