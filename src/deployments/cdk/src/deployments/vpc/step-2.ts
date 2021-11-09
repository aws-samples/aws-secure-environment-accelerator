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

import * as ec2 from '@aws-cdk/aws-ec2';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { AccountBuckets } from '../defaults';
import * as cdk from '@aws-cdk/core';
import { createLogGroupName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { NONE_DESTINATION_TYPE, S3_DESTINATION_TYPE, BOTH_DESTINATION_TYPE } from './outputs';

export interface VpcStep2Props {
  accountBuckets: AccountBuckets;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
}

export interface VpcFlowLogsConfigProps {
  trafficType: ec2.FlowLogTrafficType;
  aggregationInterval: number;
  customFields?: string;
}

export async function step2(props: VpcStep2Props) {
  createFlowLogs(props);
}

function createFlowLogs(props: VpcStep2Props) {
  const { accountBuckets, accountStacks, config, outputs } = props;
  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    const flowLogs = vpcConfig['flow-logs'];
    if (flowLogs === NONE_DESTINATION_TYPE) {
      continue;
    }

    const flowLogRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'FlowLogRole',
    });
    if (!flowLogRoleOutput) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const accountBucket = accountBuckets[accountKey];
    if (!accountBucket) {
      console.warn(`Cannot find account bucket ${accountStack.accountKey}`);
      continue;
    }

    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      region: vpcConfig.region,
      vpcName: vpcConfig.name,
    });
    if (!vpcOutput) {
      console.warn(`Cannot find VPC "${vpcConfig.name}" to enable flow logs`);
      continue;
    }

    let logGroup;
    if (vpcConfig['flow-logs'] !== S3_DESTINATION_TYPE) {
      const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        roleKey: 'LogGroupRole',
      });
      if (!logGroupLambdaRoleOutput) {
        continue;
      }

      logGroup = new LogGroup(accountStack, `LogGroup${accountStack}${vpcConfig.name}`, {
        logGroupName: createLogGroupName(`flowlogs/${vpcConfig.name}`, 0),
        roleArn: logGroupLambdaRoleOutput.roleArn,
      });
    }

    let logDestinations: string[];
    let logDestinationTypes: ec2.FlowLogDestinationType[];
    const logS3Destination = `${accountBucket.bucketArn}/${cdk.Aws.ACCOUNT_ID}/${vpcConfig.name}`;
    if (vpcConfig['flow-logs'] !== BOTH_DESTINATION_TYPE) {
      if (vpcConfig['flow-logs'] === S3_DESTINATION_TYPE) {
        logDestinations = [logS3Destination];
        logDestinationTypes = [ec2.FlowLogDestinationType.S3];
      } else {
        logDestinations = [logGroup?.logGroupArn!];
        logDestinationTypes = [ec2.FlowLogDestinationType.CLOUD_WATCH_LOGS];
      }
    } else {
      logDestinations = [logS3Destination, logGroup?.logGroupArn!];
      logDestinationTypes = [ec2.FlowLogDestinationType.S3, ec2.FlowLogDestinationType.CLOUD_WATCH_LOGS];
    }

    const vpcFlowLogConfig = getVpcFlowLogConfiguration({ config });
    createVpcFlowLog({
      scope: accountStack,
      vpcName: vpcConfig.name,
      roleArn: flowLogRoleOutput.roleArn,
      vpcId: vpcOutput.vpcId,
      trafficType: vpcFlowLogConfig.trafficType,
      logDestinations,
      logDestinationTypes,
      aggregationInterval: vpcFlowLogConfig.aggregationInterval,
      customFields: vpcFlowLogConfig.customFields,
    });
  }
}

/**
 *
 * Creates Flow Logs for a Vpc
 * @param props
 */
function createVpcFlowLog(props: {
  scope: cdk.Construct;
  vpcName: string;
  roleArn: string;
  vpcId: string;
  trafficType: ec2.FlowLogTrafficType;
  logDestinations: string[];
  logDestinationTypes: ec2.FlowLogDestinationType[];
  aggregationInterval: number;
  customFields?: string;
}) {
  const {
    scope,
    vpcName,
    roleArn,
    vpcId,
    trafficType,
    logDestinations,
    logDestinationTypes,
    aggregationInterval,
    customFields,
  } = props;
  for (const [index, logDestination] of logDestinations.entries()) {
    const flowLogs = new ec2.CfnFlowLog(scope, `FlowLog${vpcName}${logDestinationTypes[index]}`, {
      deliverLogsPermissionArn: roleArn,
      resourceId: vpcId,
      resourceType: 'VPC',
      trafficType,
      logDestination,
      logDestinationType: logDestinationTypes[index],
    });
    flowLogs.addPropertyOverride('MaxAggregationInterval', aggregationInterval);
    if (customFields) {
      flowLogs.addPropertyOverride('LogFormat', customFields);
    }
  }
}

/**
 *
 * Function to prepare the Flow Log properties based on global configuration
 * @param props
 *
 */
function getVpcFlowLogConfiguration(props: { config: AcceleratorConfig }): VpcFlowLogsConfigProps {
  const { config } = props;
  const flowLogsConfig = config['global-options']['vpc-flow-logs'];

  const trafficType = flowLogsConfig.filter as ec2.FlowLogTrafficType;

  let customFields;
  if (!flowLogsConfig['default-format']) {
    customFields = flowLogsConfig['custom-fields'].map(c => `$\{${c}\}`).join(' ');
  }

  return {
    trafficType,
    aggregationInterval: flowLogsConfig.interval,
    customFields,
  };
}
