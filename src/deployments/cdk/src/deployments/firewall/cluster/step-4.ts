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

import { Vpc } from '@aws-accelerator/cdk-constructs/src/vpc';
import * as c from '@aws-accelerator/common-config/src';
import * as cdk from 'aws-cdk-lib';
import {
  getStackJsonOutput,
  OUTPUT_SUBSCRIPTION_REQUIRED,
  StackOutput,
} from '@aws-accelerator/common-outputs/src/stack-output';
import { AccountStacks, AccountStack } from '../../../common/account-stacks';
import { createIamInstanceProfileName } from '../../../common/iam-assets';
import { LaunchConfiguration } from '@aws-accelerator/cdk-constructs/src/autoscaling';
import * as elb from 'aws-cdk-lib/aws-autoscaling';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { LoadBalancerOutputFinder } from '@aws-accelerator/common-outputs/src/elb';
import { DynamicSecretOutputFinder } from '@aws-accelerator/common-outputs/src/secrets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Account } from '../../../utils/accounts';
import { getDynamicReplaceableValue } from '../../../common/replacements';

export interface FirewallStep4Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  vpcs: Vpc[];
  defaultRegion: string;
  accounts: Account[];
}

/**
 * Creates the firewall clusters under autoscaling using LoadBalancer and targetgroups created in phase-3.
 *
 * The following outputs are necessary from previous steps:
 *   - firewall amis subscription, validation output in phase-1
 *   - LoadBalancer and TargetGroup created in phase-3
 */
export async function step4(props: FirewallStep4Props) {
  const { accountStacks, config, outputs, vpcs, defaultRegion, accounts } = props;
  const vpcConfigs = config.getVpcConfigs();

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const firewallConfigs = accountConfig.deployments?.firewalls;
    if (!firewallConfigs || firewallConfigs.length === 0) {
      continue;
    }

    const subscriptionOutputs = getStackJsonOutput(outputs, {
      outputType: 'AmiSubscriptionStatus',
      accountKey,
    });

    for (const firewallConfig of firewallConfigs.filter(firewall => c.FirewallAutoScaleConfigType.is(firewall))) {
      if (!firewallConfig.deploy || !c.FirewallAutoScaleConfigType.is(firewallConfig)) {
        console.log(`Deploy set to false for "${firewallConfig.name}"`);
        continue;
      }

      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, firewallConfig.region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountStack}`);
        continue;
      }

      const subscriptionStatus = subscriptionOutputs.find(sub => sub.imageId === firewallConfig['image-id']);
      if (!subscriptionStatus || (subscriptionStatus && subscriptionStatus.status === OUTPUT_SUBSCRIPTION_REQUIRED)) {
        console.log(`AMI Marketplace subscription required for ImageId: ${firewallConfig['image-id']}`);
        continue;
      }

      const vpc = vpcs.find(v => v.name === firewallConfig.vpc);
      if (!vpc) {
        console.log(`Skipping firewall deployment because of missing VPC "${firewallConfig.vpc}"`);
        continue;
      }

      const vpcConfig = vpcConfigs.find(
        v =>
          v.vpcConfig.name === firewallConfig.vpc &&
          v.accountKey === accountKey &&
          v.vpcConfig.region === firewallConfig.region,
      )?.vpcConfig;
      if (!vpcConfig) {
        console.log(`Skipping firewall deployment because of missing VPC config "${firewallConfig.vpc}"`);
        continue;
      }

      const elbOutput = LoadBalancerOutputFinder.tryFindOneByName({
        outputs,
        accountKey,
        name: firewallConfig['load-balancer'],
        region: firewallConfig.region,
      });
      if (!elbOutput) {
        console.warn(`Didn't find output for Gwlb : "${firewallConfig['load-balancer']}"`);
        continue;
      }

      const keyPairs = accountConfig['key-pairs'].filter(kp => kp.region === firewallConfig.region).map(kp => kp.name);
      let keyName = firewallConfig['key-pair'];
      if (keyName && keyPairs.includes(keyName)) {
        keyName = createName({
          name: keyName,
          suffixLength: 0,
        });
      }
      await createFirewallCluster({
        accountStack,
        firewallConfig,
        vpc,
        vpcConfig,
        targetGroups: Object.values(elbOutput.targets),
        keyName,
        userData: await addReplacementsToUserData({
          userData: firewallConfig['user-data']!,
          accountKey,
          accountStack,
          config,
          defaultRegion,
          outputs,
          accounts,
          launchConfigName: firewallConfig.name,
          fwManagerName: accountConfig.deployments?.['firewall-manager']?.name || undefined,
          bootstrap: firewallConfig.bootstrap,
        }),
        firewallManagerName: accountConfig.deployments?.['firewall-manager']?.name,
      });
    }
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFirewallCluster(props: {
  accountStack: AccountStack;
  firewallConfig: c.FirewallAutoScaleConfigType;
  vpc: Vpc;
  vpcConfig: c.VpcConfig;
  targetGroups: string[];
  keyName?: string;
  userData?: string;
  firewallManagerName?: string;
}) {
  const { accountStack, firewallConfig, vpc, targetGroups, keyName, userData, firewallManagerName } = props;

  const {
    name: firewallName,
    'security-group': securityGroupName,
    'enforce-imdsv2': enforceImdsv2,
    'fw-instance-role': instanceRoleName,
    'image-id': imageId,
    'instance-sizes': instanceType,
    'desired-hosts': desiredCapacity,
    'min-hosts': minSize,
    'max-hosts': maxSize,
    'max-instance-age': maxInstanceAge,
    subnet: subnetName,
    'block-device-mappings': deviceNames,
    'create-eip': associatePublicIpAddress,
    'cpu-utilization-scale-in': cpuUtilizationScaleIn,
    'cpu-utilization-scale-out': cpuUtilizationScaleOut,
    'apply-tags': tags,
  } = firewallConfig;
  const securityGroup = vpc.tryFindSecurityGroupByName(securityGroupName);
  if (!securityGroup) {
    console.warn(`Cannot find security group with name "${securityGroupName}" in VPC "${vpc.name}"`);
    return;
  }

  const launchConfigurationName = createName({
    name: `${firewallName}`,
    suffixLength: 0,
  });

  const launchTemplateName = createName({
    name: `${firewallName}lt`,
    suffixLength: 0,
  });

  const blockDeviceMappings = deviceNames.map(deviceName => ({
    deviceName,
    ebs: {
      encrypted: true,
      volumeType: 'gp2',
      volumeSize: firewallConfig['root-volume-size'],
    },
  }));

  const launchTemplate = new cdk.aws_ec2.CfnLaunchTemplate(accountStack, `FirewallLaunchTemplate-${firewallName}`, {
    launchTemplateName,
    launchTemplateData: {
      blockDeviceMappings,
      // securityGroupIds: [securityGroup.securityGroups[0].id],
      imageId,
      iamInstanceProfile: {
        name: instanceRoleName ? createIamInstanceProfileName(instanceRoleName) : undefined,
      },
      networkInterfaces: [
        {
          deviceIndex: 0,
          associatePublicIpAddress,

          groups: [securityGroup.id],
        },
      ],
      instanceType,
      keyName,
      metadataOptions: {
        httpTokens: 'required',
        httpEndpoint: 'enabled',
      },
      userData: userData ? cdk.Fn.base64(userData) : undefined,
    },
  });

  // Create LaunchConfiguration
  const launchConfig = new LaunchConfiguration(accountStack, `FirewallLaunchConfiguration-${firewallName}`, {
    launchConfigurationName,
    associatePublicIpAddress,
    imageId,
    metadataOptions: enforceImdsv2 ? { httpEndpoint: 'enabled', httpTokens: 'required' } : undefined,
    securityGroups: [securityGroup.id],
    iamInstanceProfile: instanceRoleName ? createIamInstanceProfileName(instanceRoleName) : undefined,
    instanceType,
    blockDeviceMappings,
    keyName,
    userData: userData ? cdk.Fn.base64(userData) : undefined,
  });

  const autoScalingGroupName = createName({
    name: `${firewallName}-asg`,
    suffixLength: 0,
  });
  const subnetIds = vpc.findSubnetIdsByName(subnetName);
  const autoScaleTags: elb.CfnAutoScalingGroup.TagPropertyProperty[] = [];
  /* eslint-disable no-template-curly-in-string */
  for (const [key, value] of Object.entries(tags || {})) {
    let tagValue = value;
    let replacementValue = tagValue.match('\\${SEA::([a-zA-Z0-9-]*)}');
    while (replacementValue) {
      const replaceKey = replacementValue[1];
      let replaceValue = replaceKey;
      if (replaceKey === 'FirewallLaunchConfig') {
        replaceValue = launchConfigurationName;
      } else if (replaceKey === 'FirewallManager' && firewallManagerName) {
        replaceValue = createName({
          name: firewallManagerName,
          suffixLength: 0,
        });
      }
      tagValue = tagValue.replace(new RegExp('\\${SEA::' + replaceKey + '}', 'g'), replaceValue);
      replacementValue = tagValue.match('\\${SEA::([a-zA-Z0-9-]*)}');
    }
    /* eslint-enable */
    autoScaleTags.push({
      key,
      propagateAtLaunch: true,
      value: tagValue,
    });
  }
  if (!autoScaleTags.find(at => at.key === 'Name')) {
    autoScaleTags.push({
      key: 'Name',
      value: autoScalingGroupName,
      propagateAtLaunch: true,
    });
  }
  const autoScalingGroup = new elb.CfnAutoScalingGroup(accountStack, `Firewall-AutoScalingGroup-${firewallName}`, {
    autoScalingGroupName,
    launchTemplate: {
      version: '1',
      launchTemplateId: launchTemplate.ref,
    },
    vpcZoneIdentifier: subnetIds,
    maxInstanceLifetime: maxInstanceAge * 86400,
    minSize: `${minSize}`,
    maxSize: `${maxSize}`,
    desiredCapacity: `${desiredCapacity}`,
    targetGroupArns: targetGroups,
    tags: autoScaleTags,
  });

  if (cpuUtilizationScaleIn) {
    const cpuHighScalingPolicy = new elb.CfnScalingPolicy(accountStack, `CpuUtilizationHigh-${firewallName}-Policy`, {
      autoScalingGroupName: autoScalingGroup.ref,
      adjustmentType: elb.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: '300',
      scalingAdjustment: 1,
    });

    new cloudwatch.CfnAlarm(accountStack, `CpuUtilizationHigh-${firewallName}-Alarm`, {
      alarmName: createName({
        name: `CpuUtilizationHigh-${firewallName}`,
        suffixLength: 8,
      }),
      alarmDescription: 'Scale-up if CPU > 80% for 10 minutes',
      metricName: 'CPUUtilization',
      namespace: 'AWS/EC2',
      statistic: cloudwatch.Stats.AVERAGE,
      period: 300,
      evaluationPeriods: 2,
      threshold: cpuUtilizationScaleIn,
      alarmActions: [cpuHighScalingPolicy.ref],
      dimensions: [
        {
          name: autoScalingGroupName,
          value: autoScalingGroup.ref,
        },
      ],
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
  }

  if (cpuUtilizationScaleOut) {
    const cpuLowScalingPolicy = new elb.CfnScalingPolicy(accountStack, `CpuUtilizationLow-${firewallName}-Policy`, {
      autoScalingGroupName: autoScalingGroup.ref,
      adjustmentType: elb.AdjustmentType.CHANGE_IN_CAPACITY,
      cooldown: '300',
      scalingAdjustment: -1,
    });

    new cloudwatch.CfnAlarm(accountStack, `CpuUtilizationLow-${firewallName}-Alarm`, {
      alarmName: createName({
        name: `CpuUtilizationLow-${firewallName}`,
        suffixLength: 8,
      }),
      alarmDescription: 'Scale-down if CPU < 60% for 10 minutes',
      metricName: 'CPUUtilization',
      namespace: 'AWS/EC2',
      statistic: cloudwatch.Stats.AVERAGE,
      period: 300,
      evaluationPeriods: 2,
      threshold: cpuUtilizationScaleOut,
      alarmActions: [cpuLowScalingPolicy.ref],
      dimensions: [
        {
          name: autoScalingGroupName,
          value: autoScalingGroup.ref,
        },
      ],
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
    });
  }
}

export async function addReplacementsToUserData(props: {
  accountStack: AccountStack;
  outputs: StackOutput[];
  accounts?: Account[];
  accountKey: string;
  config: c.AcceleratorConfig;
  userData: string;
  defaultRegion: string;
  launchConfigName?: string;
  fwManagerName?: string;
  fwRegion?: string;
  bootstrap?: string;
}) {
  const {
    accountKey,
    accountStack,
    accounts,
    config,
    outputs,
    defaultRegion,
    launchConfigName,
    fwManagerName,
    fwRegion,
    bootstrap,
  } = props;
  let { userData } = props;
  /* eslint-disable no-template-curly-in-string */
  while (!!userData.match('\\${SEA::([a-zA-Z0-9-]*)}')) {
    const replacementMatch = userData.match('\\${SEA::([a-zA-Z0-9-]*)}');
    let replaceValue: string = '';
    if (replacementMatch) {
      const replaceKey = replacementMatch[1];
      if (replaceKey.startsWith('SECRET-')) {
        const secretKey = replaceKey.split('SECRET-')?.[1];
        if (secretKey) {
          const secretOutput = DynamicSecretOutputFinder.tryFindOne({
            accountKey,
            region: accountStack.region,
            outputs,
            predicate: o => o.name === secretKey,
          });
          if (secretOutput) {
            // replaceValue = cdk.SecretValue.secretsManager(secretOutput.arn).toString();
            replaceValue = secretOutput.value;
          } else {
            console.warn(`Didn't find Secret ${secretKey} in account ${accountKey}`);
          }
        }
      } else {
        if (replaceKey === 'FirewallLaunchConfig' && launchConfigName) {
          replaceValue = createName({
            name: launchConfigName,
            suffixLength: 0,
          });
        } else if (replaceKey === 'FirewallManager' && fwManagerName) {
          replaceValue = createName({
            name: fwManagerName,
            suffixLength: 0,
          });
        } else if (replaceKey === 'FirewallRegion' && fwRegion) {
          replaceValue = fwRegion;
        } else if (replaceKey === 'BOOTSTRAP') {
          if (bootstrap) {
            const bootstrapValue = await addReplacementsToUserData({
              userData: bootstrap,
              accountKey,
              accountStack,
              config,
              defaultRegion,
              outputs,
              accounts,
              launchConfigName,
              fwManagerName,
              fwRegion,
            });
            replaceValue = cdk.Fn.base64(bootstrapValue);
          }
        } else {
          replaceValue = getDynamicReplaceableValue({
            paramKey: replaceKey,
            outputs,
            config,
            accountKey,
            defaultRegion,
          });
        }
      }
      userData = userData.replace(new RegExp('\\${SEA::' + replaceKey + '}', 'g'), replaceValue);
    }
  }
  /* eslint-enable */
  return userData;
}
