import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import * as nlb from '@aws-cdk/aws-elasticloadbalancingv2';
import { NetworkLoadBalancer, RsysLogAutoScalingGroup, Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AcceleratorConfig, RsyslogConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { SecurityGroup } from '../../common/security-group';
import { LogGroup } from '@custom-resources/logs-log-group';
import { createLogGroupName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { StructuredOutput } from '../../common/structured-output';
import { RsyslogRoleOutputType, RsyslogDnsOutputType, RsyslogDnsOutputTypeOutput } from './outputs';

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

    // createAsg(accountKey, rsyslogConfig, accountStack, outputs, vpc, '');

    const targetGroup = createNlb(accountKey, rsyslogConfig, accountStack, vpc);
    if (targetGroup) {
      createAsg(accountKey, rsyslogConfig, accountStack, outputs, vpc, targetGroup.ref);
    }
  }
}

export function createNlb(
  accountKey: string,
  rsyslogConfig: RsyslogConfig,
  accountStack: AcceleratorStack,
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
    ports: 514,
    protocol: 'UDP',
    actionType: 'forward',
    targetGroupArns: [rsyslogTargetGroup.ref],
  });

  new StructuredOutput<RsyslogDnsOutputTypeOutput>(accountStack, 'RsyslogDnsOutput', {
    type: RsyslogDnsOutputType,
    value: {
      name: balancer.name,
      dns: balancer.dns,
    },
  });

  return rsyslogTargetGroup;
}

export function createAsg(
  accountKey: string,
  rsyslogConfig: RsyslogConfig,
  accountStack: AcceleratorStack,
  outputs: StackOutput[],
  vpc: Vpc,
  targetGroupArn: string,
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

  const rsyslogAutoScalingRoleOutputs = StructuredOutput.fromOutputs(outputs, {
    accountKey,
    type: RsyslogRoleOutputType,
  });
  if (rsyslogAutoScalingRoleOutputs.length !== 1) {
    console.warn(`Cannot find required service-linked auto scaling role in account "${accountKey}"`);
    return;
  }
  const rsyslogAutoScalingRoleOutput = rsyslogAutoScalingRoleOutputs[0];

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

  const latestRsyslogAmiId = ssm.StringParameter.valueForTypedStringParameter(
    accountStack,
    rsyslogConfig['ssm-image-id'],
    ssm.ParameterType.AWS_EC2_IMAGE_ID,
  );

  new RsysLogAutoScalingGroup(accountStack, `RsyslogAsg${accountKey}`, {
    latestRsyslogAmiId,
    subnetIds: instanceSubnetIds,
    stackId: accountStack.stackId,
    serviceLinkedRoleArn: rsyslogAutoScalingRoleOutput.roleArn,
    acceleratorPrefix: accountStack.acceleratorPrefix,
    securityGroupId,
    rsyslogConfig,
    logGroupName: logGroup.logGroupName,
    targetGroupArn,
  });
}

export function createTargetGroupForInstance(scope: cdk.Construct, targetGroupName: string, vpcId: string) {
  return new nlb.CfnTargetGroup(scope, `TgRsyslog${targetGroupName}`, {
    name: targetGroupName,
    targetType: 'instance',
    protocol: 'UDP',
    port: 514,
    vpcId,
    healthCheckPort: '514',
  });
}
