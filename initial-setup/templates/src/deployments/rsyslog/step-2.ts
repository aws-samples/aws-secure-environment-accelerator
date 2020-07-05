import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import * as nlb from '@aws-cdk/aws-elasticloadbalancingv2';
import { NetworkLoadBalancer, RsysLogAutoScalingGroup, Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AcceleratorConfig, RsyslogConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { SecurityGroup } from '../../common/security-group';
import { LogGroup } from '@custom-resources/logs-log-group';
import { createLogGroupName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface RSysLogStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
  vpcs: Vpc[];
}

export async function step2(props: RSysLogStep1Props) {
  const { accountStacks, config, outputs, vpcs } = props;

  for (const [accountKey, accountConfig] of config.getMandatoryAccountConfigs()) {
    const rsyslogConfig = accountConfig.deployments?.rsyslog;
    if (!rsyslogConfig || !rsyslogConfig.deploy) {
      continue;
    }

    const vpc = vpcs.find(v => v.name === rsyslogConfig['vpc-name']);
    if (!vpc) {
      console.log(`Skipping Rsyslog deployment because of missing VPC "${rsyslogConfig['vpc-name']}"`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    createNlb(accountKey, rsyslogConfig, accountStack, outputs, vpc);
    createAsg(accountKey, rsyslogConfig, accountStack, outputs, vpc);
  }
}

export function createNlb(
  accountKey: string,
  rsyslogConfig: RsyslogConfig,
  accountStack: AcceleratorStack,
  outputs: StackOutput[],
  vpc: Vpc,
) {
  const nlbSubnetIds: string[] = [];
  for (const subnetConfig of rsyslogConfig['web-subnets']) {
    const subnet = vpc.tryFindSubnetByNameAndAvailabilityZone(subnetConfig.name, subnetConfig.az);
    if (!subnet) {
      console.warn(`Cannot find web subnet with name "${subnetConfig.name}" in availability zone "${subnetConfig.az}"`);
      continue;
    }
    nlbSubnetIds.push(subnet.id);
  }

  if (nlbSubnetIds.length === 0) {
    console.log(`Skipping Rsyslog deployment because of missing web subnets "${rsyslogConfig['web-subnets']}"`);
    return;
  }

  const rsyslogTargetGroup = createTargetGroupForInstance(accountStack, 'RsyslogTG', vpc.id);

  const balancer = new NetworkLoadBalancer(accountStack, `NlbRsyslog${accountKey}`, {
    nlbName: 'RsyslogNlb',
    scheme: 'internal',
    subnetIds: nlbSubnetIds,
    ipType: 'ipv4',
  });

  // Add default listener
  balancer.addListener({
    ports: 80,
    protocol: 'HTTP',
    actionType: 'forward',
    targetGroupArns: [rsyslogTargetGroup.ref],
  });
}

export function createAsg(
  accountKey: string,
  rsyslogConfig: RsyslogConfig,
  accountStack: AcceleratorStack,
  outputs: StackOutput[],
  vpc: Vpc,
) {
  const instanceSubnetIds: string[] = [];
  for (const subnetConfig of rsyslogConfig['app-subnets']) {
    const subnet = vpc.tryFindSubnetByNameAndAvailabilityZone(subnetConfig.name, subnetConfig.az);
    if (!subnet) {
      console.warn(`Cannot find app subnet with name "${subnetConfig.name}" in availability zone "${subnetConfig.az}"`);
      continue;
    }
    instanceSubnetIds.push(subnet.id);
  }

  if (instanceSubnetIds.length === 0) {
    console.log(`Skipping Rsyslog deployment because of missing app subnets "${rsyslogConfig['app-subnets']}"`);
    return;
  }

  // creating security group for the instance
  const securityGroup = new SecurityGroup(accountStack, `RsysLogSG${accountKey}`, {
    securityGroups: rsyslogConfig['security-groups'],
    accountKey,
    vpcId: vpc.id,
    vpcName: vpc.name,
  });
  const securityGroupId = securityGroup.securityGroups[0].id;

  const logGroup = new LogGroup(accountStack, 'SSMLogGroup', {
    logGroupName: createLogGroupName(rsyslogConfig['log-group-name']),
  });

  const latestRdgwAmiId = ssm.StringParameter.valueForTypedStringParameter(
    accountStack,
    rsyslogConfig['ssm-image-id'],
    ssm.ParameterType.AWS_EC2_IMAGE_ID,
  );

  new RsysLogAutoScalingGroup(accountStack, `RsyslogAsg${accountKey}`, {
    latestRdgwAmiId,
    subnetIds: instanceSubnetIds,
    stackId: accountStack.stackId,
    serviceLinkedRoleArn: '', // TODO
    acceleratorPrefix: accountStack.acceleratorPrefix,
    securityGroupId,
    rsyslogConfig,
    logGroupName: logGroup.logGroupName,
  });
}

export function createTargetGroupForInstance(scope: cdk.Construct, targetGroupName: string, vpcId: string) {
  return new nlb.CfnTargetGroup(scope, `TgRsyslog${targetGroupName}`, {
    name: targetGroupName,
    targetType: 'instance',
    protocol: 'UDP',
    port: 514,
    vpcId,
  });
}
