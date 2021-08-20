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
import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import * as cdk from '@aws-cdk/core';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { StructuredOutput } from '../../common/structured-output';
import { InstanceTimeOutputType, InstanceStatusOutput, getTimeDiffInMinutes } from './outputs';
import { InstanceLaunchTime } from '@aws-accelerator/custom-resource-ec2-launch-time';

export interface InstanceStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 *
 *  Verify instance output and creates Ec2 instance
 *  to increase new account limits for FW instances
 *
 */
export async function step1(props: InstanceStep1Props) {
  const { accountStacks, config, outputs } = props;
  const accountKeys = config.getAccountConfigs().map(([accountKey, _]) => accountKey);

  for (const accountKey of accountKeys) {
    const accountConfig = config.getAccountByKey(accountKey);
    if (!accountConfig['account-warming-required']) {
      console.log(
        `Skipping creation of Ec2 instance because account-warming-required is false  for account "${accountKey}"`,
      );
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }

    const instanceTimeOutputs = StructuredOutput.fromOutputs(outputs, {
      type: InstanceTimeOutputType,
      accountKey,
    });

    const instanceTimeOutput = instanceTimeOutputs?.[0];
    const instanceCreationTime = instanceTimeOutput?.time;

    if (!instanceCreationTime || getTimeDiffInMinutes(instanceCreationTime) < 15) {
      // create an ec2 instance and write the instance details output
      const instance = createInstance(accountStack, accountKey);
      const launchTime = getLaunchTime(accountStack, instance.ref, accountKey);
      new StructuredOutput<InstanceStatusOutput>(accountStack, `InstanceOutput${accountKey}`, {
        type: InstanceTimeOutputType,
        value: {
          instanceId: instance.ref,
          time: launchTime.launchTime,
        },
      });
    } else {
      new StructuredOutput<InstanceStatusOutput>(accountStack, `InstanceOutput${accountKey}`, {
        type: InstanceTimeOutputType,
        value: {
          instanceId: instanceTimeOutput.instanceId,
          time: instanceTimeOutput.time,
        },
      });
    }
  }
}

const createInstance = (scope: cdk.Construct, accountKey: string): ec2.CfnInstance => {
  const vpc = new ec2.CfnVPC(scope, `Vpc_Aw_${accountKey}`, {
    cidrBlock: '10.10.10.0/24',
  });

  const subnet = new ec2.CfnSubnet(scope, `Subnet_Aw_${accountKey}`, {
    cidrBlock: '10.10.10.0/24',
    vpcId: vpc.ref,
    availabilityZone: `${cdk.Aws.REGION}a`,
  });

  const instance = new ec2.CfnInstance(scope, `Ec2Instance_Aw_${accountKey}`, {
    imageId: new ec2.AmazonLinuxImage().getImage(scope).imageId,
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO).toString(),
    subnetId: subnet.ref,
    blockDeviceMappings: [
      {
        deviceName: '/dev/xvda',
        ebs: {
          encrypted: true,
        },
      },
    ],
  });
  return instance;
};

const getLaunchTime = (scope: cdk.Construct, instanceId: string, accountKey: string): InstanceLaunchTime => {
  const instance = new InstanceLaunchTime(scope, `InstanceStatus${accountKey}`, {
    instanceId,
  });
  return instance;
};
