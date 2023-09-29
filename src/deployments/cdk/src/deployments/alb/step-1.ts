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

import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as alb from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { ApplicationLoadBalancer, GatewayLoadBalancer } from '@aws-accelerator/cdk-constructs/src/vpc';
import { CfnLoadBalancerOutput } from './outputs';
import {
  AcceleratorConfig,
  AlbConfigType,
  GwlbConfigType,
  ElbTargetConfig,
  ElbTargetInstanceConfig,
  ElbTargetInstanceFirewallConfigType,
} from '@aws-accelerator/common-config/src';
import { SecurityGroupsOutput, VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { StackOutput, getStackJsonOutput, ALB_NAME_REGEXP } from '@aws-accelerator/common-outputs/src/stack-output';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorStack } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { createName, createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { createCertificateSecretName } from '../certificates';
import { FirewallInstanceOutputFinder } from '../firewall/cluster/outputs';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { ModifyVpcEndpointServicePermissions } from '@aws-accelerator/custom-resource-modify-vpc-endpoint-service-permissions';
import { getAccountId, Account } from '@aws-accelerator/common-outputs/src/accounts';
import { Construct } from 'constructs';

export interface ElbStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
  aesLogArchiveBucket: s3.IBucket;
  acceleratorExecutionRoleName?: string;
  accounts?: Account[];
  deployAlb?: boolean;
  deployGlb?: boolean;
}

export async function step1(props: ElbStep1Props) {
  const {
    accountStacks,
    config,
    outputs,
    aesLogArchiveBucket,
    acceleratorExecutionRoleName,
    accounts,
    deployAlb,
    deployGlb,
  } = props;

  const vpcConfigs = config.getVpcConfigs();
  for (const { ouKey, accountKey, albs: albConfigs } of config.getElbConfigs()) {
    if (albConfigs.length === 0) {
      continue;
    }

    if (ouKey) {
      const accountConfigs = config.getAccountConfigsForOu(ouKey);
      const accountConfig = accountConfigs.find(([aKey, _]) => aKey === accountKey);
      if (accountConfig && accountConfig[1]['exclude-ou-albs']) {
        continue;
      }
    }

    for (const albConfig of albConfigs) {
      const vpcConfig = vpcConfigs.find(v => v.vpcConfig.name === albConfig.vpc)?.vpcConfig;
      if (!vpcConfig) {
        console.warn(`Cannot find vpc config with name ${albConfig.vpc}`);
        continue;
      }

      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }
      const accountConfig = config.getAccountConfigs().find(([accKey, _]) => accKey === accountKey)?.[1];
      const tags = albConfig['apply-tags'] || {};
      /* eslint-disable no-template-curly-in-string */
      for (const [key, value] of Object.entries(tags)) {
        let tagValue = value;
        let replacementValue = tagValue.match('\\${SEA::([a-zA-Z0-9-]*)}');
        while (replacementValue) {
          const replaceKey = replacementValue[1];
          let replaceValue = replaceKey;
          if (replaceKey === 'FirewallLaunchConfig') {
            if (
              accountConfig &&
              accountConfig.deployments &&
              accountConfig.deployments.firewalls &&
              accountConfig.deployments.firewalls.length > 0
            ) {
              const fwConfig = accountConfig.deployments.firewalls.find(
                fw => fw.type === 'autoscale' && fw.deploy && fw['load-balancer'] === albConfig.name,
              );
              if (fwConfig) {
                replaceValue = createName({
                  name: fwConfig.name,
                  suffixLength: 0,
                });
              }
            }
          } else if (
            replaceKey === 'FirewallManager' &&
            accountConfig &&
            accountConfig.deployments &&
            accountConfig.deployments['firewall-manager']
          ) {
            replaceValue = createName({
              name: accountConfig.deployments['firewall-manager'].name,
              suffixLength: 0,
            });
          }
          tagValue = tagValue.replace(new RegExp('\\${SEA::' + replaceKey + '}', 'g'), replaceValue);
          replacementValue = tagValue.match('\\${SEA::([a-zA-Z0-9-]*)}');
        }
        /* eslint-enable */
        tags[key] = tagValue;
      }
      if (albConfig.type === 'ALB' && deployAlb) {
        createAlb({
          accountKey,
          albConfig,
          accountStack,
          outputs,
          aesLogArchiveBucket,
          deploy: vpcConfig.deploy,
          tags,
        });
      } else if (albConfig.type === 'GWLB' && deployGlb) {
        createGlb({
          accountKey,
          lbConfig: albConfig,
          accountStack,
          outputs,
          acceleratorExecutionRoleName: acceleratorExecutionRoleName!,
          accounts: accounts!,
          tags,
        });
      }
    }
  }
}

export function createAlb(props: {
  accountKey: string;
  albConfig: AlbConfigType;
  accountStack: AcceleratorStack;
  outputs: StackOutput[];
  aesLogArchiveBucket: s3.IBucket;
  deploy: string;
  tags?: { [key: string]: string };
}) {
  const { accountKey, accountStack, aesLogArchiveBucket, albConfig, deploy, outputs, tags } = props;
  const certificateSecretName = createCertificateSecretName(albConfig['cert-name']!);
  const certificateSecret = cdk.SecretValue.secretsManager(certificateSecretName);

  const vpc = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
    outputs,
    vpcName: albConfig.vpc,
  });
  if (!vpc) {
    console.warn(`Cannot find output with vpc name ${albConfig.vpc}`);
    return;
  }

  const subnets = vpc.subnets.filter(s => s.subnetName === albConfig.subnets);
  if (subnets.length === 0) {
    console.warn(`Cannot find output with subnet name ${albConfig.subnets}`);
    return;
  }

  let securityGroupId: string;
  if (deploy === 'local') {
    const securityGroup = vpc.securityGroups.find(sg => sg.securityGroupName === albConfig['security-group']);
    if (!securityGroup) {
      console.warn(
        `Cannot find output of vpc ${albConfig.vpc} with security group name ${albConfig['security-group']}`,
      );
      return;
    }
    securityGroupId = securityGroup.securityGroupId;
  } else {
    const securityGroupsOutput: SecurityGroupsOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'SecurityGroupsOutput',
    });
    const securityGroupOutput = securityGroupsOutput.find(s => s.vpcName === albConfig.vpc);
    if (!securityGroupOutput) {
      console.warn(`Cannot find security group output for account ${accountKey} with vpc name ${albConfig.vpc}`);
      return;
    }
    const securityGroup = securityGroupOutput.securityGroupIds.find(
      i => i.securityGroupName === albConfig['security-group'],
    );
    if (!securityGroup) {
      console.warn(
        `Cannot find security group output for account ${accountKey} with security name ${albConfig['security-group']}`,
      );
      return;
    }
    securityGroupId = securityGroup.securityGroupId;
  }

  const targetGroups: { [name: string]: string } = {};
  for (const targetConfig of albConfig.targets) {
    const targetGroup = getTargetGroupArn({
      accountStack,
      accountKey,
      albConfig,
      targetConfig,
      outputs,
      vpcId: vpc.vpcId,
    });
    if (targetGroup) {
      targetGroups[targetConfig['target-name']] = targetGroup.ref;
    }
  }

  const balancer = new ApplicationLoadBalancer(accountStack, `Alb${albConfig.name}`, {
    albName: createLbName({
      name: albConfig.name,
      accountKey: validateOrGetAccountId(accountKey),
      type: 'alb',
    }),
    scheme: albConfig.scheme,
    subnetIds: subnets.map(s => s.subnetId),
    securityGroupIds: [securityGroupId],
    ipType: albConfig['ip-type'],
    tags,
  });

  // Enable logging to the default AES bucket
  if (albConfig['access-logs']) {
    balancer.logToBucket(aesLogArchiveBucket);
  }

  if (Object.values(targetGroups).length > 0) {
    // Add default listener
    balancer.addListener({
      ports: albConfig.ports,
      protocol: albConfig.listeners,
      sslPolicy: albConfig['security-policy']!,
      certificateArn: certificateSecret.toString(),
      actionType: albConfig['action-type'],
      targetGroupArns: Object.values(targetGroups),
    });
  }

  new CfnLoadBalancerOutput(accountStack, `Alb${albConfig.name}-Output`, {
    accountKey,
    region: vpc.region,
    displayName: balancer.name,
    dnsName: balancer.dns,
    hostedZoneId: balancer.hostedZoneId,
    name: albConfig.name,
    type: 'APPLICATION',
    arn: balancer.arn,
    targets: targetGroups,
  });
}

export function createGlb(props: {
  accountKey: string;
  lbConfig: GwlbConfigType;
  accountStack: AcceleratorStack;
  outputs: StackOutput[];
  acceleratorExecutionRoleName: string;
  accounts: Account[];
  tags?: { [key: string]: string };
}) {
  const { acceleratorExecutionRoleName, accountKey, accountStack, accounts, lbConfig, outputs, tags } = props;
  // Import all VPCs from all outputs
  const vpc = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
    outputs,
    vpcName: lbConfig.vpc,
    accountKey,
  });
  if (!vpc) {
    console.warn(`Cannot find output with vpc name ${lbConfig.vpc}`);
    return;
  }

  const subnets = vpc.subnets.filter(s => s.subnetName === lbConfig.subnets);
  if (subnets.length === 0) {
    console.warn(`Cannot find output with subnet name ${lbConfig.subnets}`);
    return;
  }

  const targetGroups: { [name: string]: string } = {};
  for (const targetConfig of lbConfig.targets) {
    const targetGroup = getTargetGroupArn({
      accountStack,
      accountKey,
      albConfig: lbConfig,
      targetConfig,
      outputs,
      vpcId: vpc.vpcId,
    });
    if (targetGroup) {
      targetGroups[targetConfig['target-name']] = targetGroup.ref;
    }
  }

  const balancer = new GatewayLoadBalancer(accountStack, `Gwlb${lbConfig.name}`, {
    name: createLbName({
      name: lbConfig.name,
      accountKey: validateOrGetAccountId(accountKey),
      type: 'glb',
    }),
    subnetIds: subnets.map(s => s.subnetId),
    vpcId: vpc.vpcId,
    ipType: lbConfig['ip-type'],
    crossZone: lbConfig['cross-zone'],
    tags,
  });

  // Add default listener
  for (const [name, arn] of Object.entries(targetGroups)) {
    balancer.addListener({
      targetGroup: {
        arn,
        name,
      },
      actionType: lbConfig['action-type'],
    });
  }
  const endpointSubnets = lbConfig['endpoint-subnets'];
  const allowEndpointServiceAccounts = Array.from(
    new Set(endpointSubnets.filter(es => es.account !== 'local' && es.account !== accountKey).map(es => es.account)),
  );
  if (allowEndpointServiceAccounts.length > 0) {
    const ec2OpsRole = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'Ec2Operations',
    });
    if (!ec2OpsRole) {
      console.warn(`No Ec2Operations found in account ${accountKey}`);
    } else {
      const allowedPrincipals = allowEndpointServiceAccounts.map(
        accKey => `arn:aws:iam::${getAccountId(accounts, accKey)}:role/${acceleratorExecutionRoleName}`,
      );
      new ModifyVpcEndpointServicePermissions(accountStack, `EndpointServicePermissions-${lbConfig.name}`, {
        allowedPrincipals,
        roleArn: ec2OpsRole.roleArn,
        serviceId: balancer.service,
      });
    }
  }

  new CfnLoadBalancerOutput(accountStack, `Gwlb${lbConfig.name}-Output`, {
    accountKey,
    region: vpc.region,
    displayName: balancer.name,
    dnsName: balancer.dns,
    name: lbConfig.name,
    type: 'GATEWAY',
    arn: balancer.arn,
    hostedZoneId: balancer.service,
    targets: targetGroups,
  });
}

export function getTargetGroupArn(props: {
  accountStack: AcceleratorStack;
  accountKey: string;
  albConfig: AlbConfigType | GwlbConfigType;
  targetConfig: ElbTargetConfig;
  outputs: StackOutput[];
  vpcId: string;
}): alb.CfnTargetGroup | undefined {
  const { accountStack, accountKey, albConfig, targetConfig, outputs, vpcId } = props;
  const targetGroupName = createTargetGroupName({
    lbName: albConfig.name,
    targetGroupName: targetConfig['target-name'],
  });
  if (targetConfig['lambda-filename']) {
    const role = createLambdaRole(accountStack);
    const fileName = targetConfig['lambda-filename'];
    const lambdaArn = getLambdaFunctionArn(accountStack, fileName, role, albConfig.name, targetConfig['target-name']);

    return createTargetGroupForLambda(accountStack, targetConfig, targetGroupName, lambdaArn);
  } else if (targetConfig['target-instances'] && targetConfig['target-instances'].length > 0) {
    const instanceIds = getEc2InstanceIds(accountKey, outputs, targetConfig['target-instances']);
    if (instanceIds.length === 0) {
      console.log('Could not find any target instance IDs');
      return;
    }
    return createTargetGroupForInstance(accountStack, targetConfig, targetGroupName, vpcId, instanceIds);
  } else if (
    targetConfig['target-type'] === 'instance' &&
    (!targetConfig['target-instances'] || targetConfig['target-instances'].length === 0)
  ) {
    return createTargetGroupForInstance(accountStack, targetConfig, targetGroupName, vpcId, []);
  }
}

/**
 * Creates or gets the existing ELB Lambda role.
 */
export function createLambdaRole(scope: Construct) {
  const constructName = 'ElbLambdaAccessRole';
  const stack = cdk.Stack.of(scope);
  const child = stack.node.tryFindChild(constructName);
  if (child) {
    return child as iam.Role;
  }

  const elbLambdaAccessRole = new iam.Role(stack, `ElbLambdaAccessRole`, {
    roleName: createRoleName('ALB-L-Access'),
    assumedBy: new iam.CompositePrincipal(
      new iam.ServicePrincipal('elasticloadbalancing.amazonaws.com'),
      new iam.ServicePrincipal('lambda.amazonaws.com'),
      new iam.AccountPrincipal(cdk.Aws.ACCOUNT_ID),
    ),
    managedPolicies: [
      iam.ManagedPolicy.fromManagedPolicyArn(
        stack,
        `LambdaVPCAccessRole`,
        'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
      ),
    ],
  });

  elbLambdaAccessRole.addToPrincipalPolicy(
    new iam.PolicyStatement({
      resources: ['arn:aws:logs:*:*:*'],
      actions: ['sts:AssumeRole', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
    }),
  );
  return elbLambdaAccessRole;
}

export function getLambdaFunctionArn(
  scope: Construct,
  fileName: string,
  role: iam.Role,
  albName: string,
  targetName: string,
) {
  const artifactsFilePath = fs.readFileSync(path.join(__dirname, 'artifacts', fileName));
  const elbLambdaFunction = new lambda.Function(scope, `ElbLambdaFunction${albName}${targetName}`, {
    // Inline code is only allowed for Node.js version 12
    runtime: lambda.Runtime.NODEJS_18_X,
    code: lambda.Code.fromInline(artifactsFilePath.toString()),
    handler: 'index.handler',
    role,
  });
  elbLambdaFunction.addPermission(`InvokePermission${albName}${targetName}`, {
    action: 'lambda:InvokeFunction',
    principal: new iam.ServicePrincipal('elasticloadbalancing.amazonaws.com'),
  });
  return elbLambdaFunction.functionArn;
}

export function createTargetGroupForInstance(
  scope: Construct,
  target: ElbTargetConfig,
  targetGroupName: string,
  vpcId: string,
  instanceIds: string[],
) {
  return new alb.CfnTargetGroup(scope, `AlbTargetGroup${targetGroupName}`, {
    name: targetGroupName,
    targetType: target['target-type'],
    protocol: target.protocol,
    port: target.port,
    vpcId,
    healthCheckProtocol: target['health-check-protocol'],
    healthCheckPath: target['health-check-path'],
    healthCheckPort: String(target['health-check-port']),
    targets:
      instanceIds.length > 0
        ? instanceIds.map(instanceId => ({
            id: instanceId,
            port: target.port,
          }))
        : undefined,
  });
}

export function createTargetGroupForLambda(
  scope: Construct,
  target: ElbTargetConfig,
  targetGroupName: string,
  lambdaFunctionArn: string,
) {
  return new alb.CfnTargetGroup(scope, `AlbTargetGroup${targetGroupName}`, {
    name: targetGroupName,
    targetType: target['target-type'],
    healthCheckPath: target['health-check-path'],
    healthCheckEnabled: true,
    targets: [{ id: lambdaFunctionArn }],
  });
}

export function getEc2InstanceIds(
  accountKey: string,
  outputs: StackOutput[],
  targetInstances: ElbTargetInstanceConfig[],
): string[] {
  const firewallInstances = FirewallInstanceOutputFinder.findAll({
    outputs,
    accountKey,
  });
  const instanceIds = [];
  for (const target of targetInstances) {
    if (ElbTargetInstanceFirewallConfigType.is(target)) {
      const instance = firewallInstances.find(i => i.name === target.name && i.az === target.az);
      if (!instance) {
        console.warn(`Cannot find output with ALB instance name ${target.name} and AZ ${target.az}`);
        continue;
      }
      instanceIds.push(instance.id);
    } else {
      console.warn(`Unknown target instance type ${JSON.stringify(target)}`);
      continue;
    }
  }
  return instanceIds;
}

const ALB_NAME_SUFFIX = '-alb';
const GLB_NAME_SUFFIX = '-glb';
const LB_MAX_LENGTH = 32;
const ACCOUNT_ID_LENGTH = 12;

/**
 * Creates an LB name based on the LB name and the given account key. The returned name will not exceed 32 characters.
 */
export function createLbName(props: { name: string; accountKey: string; type: 'alb' | 'glb' }): string {
  const { name, accountKey, type } = props;
  const result = name + '-' + accountKey + (type === 'glb' ? GLB_NAME_SUFFIX : ALB_NAME_SUFFIX);
  if (result.length > LB_MAX_LENGTH) {
    // Use account ID instead of account key and trim the ALB name
    // -1 for the additional dash
    const lbNameLength =
      LB_MAX_LENGTH - (1 + ACCOUNT_ID_LENGTH + type === 'glb' ? GLB_NAME_SUFFIX.length : ALB_NAME_SUFFIX.length);
    return (
      name.substring(0, lbNameLength) + '-' + cdk.Aws.ACCOUNT_ID + (type === 'glb' ? GLB_NAME_SUFFIX : ALB_NAME_SUFFIX)
    );
  }
  return result;
}

/**
 * Creates a target group name based on the ALB name and the given target group name. The returned name will not exceed
 * 32 characters.
 */
export function createTargetGroupName(props: { lbName: string; targetGroupName: string }): string {
  const { lbName, targetGroupName } = props;
  const result = lbName + '-' + targetGroupName;
  if (result.length > LB_MAX_LENGTH) {
    const partLength = LB_MAX_LENGTH / 2;
    // -1 for the additional dash
    return lbName.substring(0, partLength - 1) + '-' + targetGroupName.substring(0, partLength);
  }
  return result;
}

/**
 * This function will check the accountKey characters and
 * if valid returns the same otherwise the Account Id
 * @param accountKey
 */
function validateOrGetAccountId(accountKey: string) {
  if (!isNameAllowed(accountKey)) {
    return cdk.Aws.ACCOUNT_ID;
  }
  return accountKey;
}

/**
 * This function will return true if the accountKey
 * has only alphanumeric and dashes (a-z, A-Z, 0-9, -)
 * otherwise returns false
 * @param accountKey
 */
function isNameAllowed(accountKey: string) {
  const match = accountKey.match(ALB_NAME_REGEXP);
  return match ? true : false;
}
