import * as ec2 from '@aws-cdk/aws-ec2';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AccountStacks } from '../../common/account-stacks';
import * as cdk from '@aws-cdk/core';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { StructuredOutput } from '../../common/structured-output';
import { InstanceTimeOutputType, InstanceStatusOutput, getTimeDiffInMinutes } from './outputs';
import { InstanceLaunchTime } from '@custom-resources/ec2-launch-time';

export interface InstanceStep1Props {
  accountKey: string;
  vpc: Vpc;
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
  const { accountKey, vpc, accountStacks, config, outputs } = props;
  const accountConfig = config.getAccountByKey(accountKey);

  if (!accountConfig['account-warming-required']) {
    console.log(
      `Skipping creation of Ec2 instance because account-warming-required is false  for account "${accountKey}"`,
    );
    return;
  }

  const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
  if (!accountStack) {
    console.warn(`Cannot find account stack ${accountStack}`);
    return;
  }

  const instanceTimeOutputs = StructuredOutput.fromOutputs(outputs, {
    type: InstanceTimeOutputType,
    accountKey,
  });

  const instanceTimeOutput = instanceTimeOutputs?.[0];
  const instanceCreationTime = instanceTimeOutput?.time;

  if (!instanceCreationTime || getTimeDiffInMinutes(instanceCreationTime) < 15) {
    // create an ec2 instance and write the instance details output
    const instance = createInstance(accountStack, vpc.subnets[0].id, accountKey);
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

const createInstance = (scope: cdk.Construct, subnetId: string, accountKey: string): ec2.CfnInstance => {
  const instance = new ec2.CfnInstance(scope, `Ec2Instance${accountKey}`, {
    imageId: new ec2.AmazonLinuxImage().getImage(scope).imageId,
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO).toString(),
    subnetId,
  });
  return instance;
};

const getLaunchTime = (scope: cdk.Construct, instanceId: string, accountKey: string): InstanceLaunchTime => {
  const instance = new InstanceLaunchTime(scope, `InstanceStatus${accountKey}`, {
    instanceId,
  });
  return instance;
};
