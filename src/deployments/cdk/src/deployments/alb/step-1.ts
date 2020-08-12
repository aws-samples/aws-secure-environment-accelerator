import * as fs from 'fs';
import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as alb from '@aws-cdk/aws-elasticloadbalancingv2';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import { ApplicationLoadBalancer } from '@aws-accelerator/cdk-constructs/src/vpc';
import {
  AcceleratorConfig,
  AlbConfig,
  AlbTargetConfig,
  AlbTargetInstanceConfig,
  AlbTargetInstanceFirewallConfigType,
} from '@aws-accelerator/common-config/src';
import { SecurityGroupsOutput, VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { StackOutput, getStackJsonOutput, ALB_NAME_REGEXP } from '@aws-accelerator/common-outputs/src/stack-output';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorStack } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-stack';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { createCertificateSecretName } from '../certificates';
import { AesBucketOutput } from '../defaults';
import { FirewallInstanceOutputFinder } from '../firewall/cluster/outputs';

export interface AlbStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
}

export async function step1(props: AlbStep1Props) {
  const { accountStacks, config, outputs } = props;

  const aesLogArchiveBucket = AesBucketOutput.getBucket({
    accountStacks,
    config,
    outputs,
  });

  const vpcConfigs = config.getVpcConfigs();
  for (const { accountKey, albs: albConfigs } of config.getAlbConfigs()) {
    if (albConfigs.length === 0) {
      continue;
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

      createAlb(accountKey, albConfig, accountStack, outputs, aesLogArchiveBucket, vpcConfig.deploy);
    }
  }
}

export function createAlb(
  accountKey: string,
  albConfig: AlbConfig,
  accountStack: AcceleratorStack,
  outputs: StackOutput[],
  aesLogArchiveBucket: s3.IBucket,
  deploy: string,
) {
  const certificateSecretName = createCertificateSecretName(albConfig['cert-name']);
  const certificateSecret = cdk.SecretValue.secretsManager(certificateSecretName);

  // Import all VPCs from all outputs
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

  const targetGroupIds = [];
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
      targetGroupIds.push(targetGroup.ref);
    }
  }

  const balancer = new ApplicationLoadBalancer(accountStack, `Alb${albConfig.name}`, {
    albName: createAlbName({
      albName: albConfig.name,
      accountKey: validateOrGetAccountId(accountKey),
    }),
    scheme: albConfig.scheme,
    subnetIds: subnets.map(s => s.subnetId),
    securityGroupIds: [securityGroupId],
    ipType: albConfig['ip-type'],
  });

  // Enable logging to the default AES bucket
  if (albConfig['access-logs']) {
    balancer.logToBucket(aesLogArchiveBucket);
  }

  if (targetGroupIds.length === 0) {
    console.warn(`cannot find output for target group instances of account ${accountKey} and Alb ${albConfig.name}`);
    return;
  }

  // Add default listener
  balancer.addListener({
    ports: albConfig.ports,
    protocol: albConfig.listeners,
    sslPolicy: albConfig['security-policy'],
    certificateArn: certificateSecret.toString(),
    actionType: albConfig['action-type'],
    targetGroupArns: targetGroupIds,
  });
}

export function getTargetGroupArn(props: {
  accountStack: AcceleratorStack;
  accountKey: string;
  albConfig: AlbConfig;
  targetConfig: AlbTargetConfig;
  outputs: StackOutput[];
  vpcId: string;
}): alb.CfnTargetGroup | undefined {
  const { accountStack, accountKey, albConfig, targetConfig, outputs, vpcId } = props;
  const role = createLambdaRole(accountStack);

  const targetGroupName = createTargetGroupName({
    albName: albConfig.name,
    targetGroupName: targetConfig['target-name'],
  });
  if (targetConfig['lambda-filename']) {
    const fileName = targetConfig['lambda-filename'];
    const lambdaArn = getLambdaFunctionArn(accountStack, fileName, role, albConfig.name, targetConfig['target-name']);

    return createTargetGroupForLambda(accountStack, targetConfig, targetGroupName, lambdaArn);
  } else if (targetConfig['target-instances']) {
    const instanceIds = getEc2InstanceIds(accountKey, outputs, targetConfig['target-instances']);
    if (instanceIds.length === 0) {
      console.log('Could not find any target instance IDs');
      return;
    }
    return createTargetGroupForInstance(accountStack, targetConfig, targetGroupName, vpcId, instanceIds);
  }
}

/**
 * Creates or gets the existing ELB Lambda role.
 */
export function createLambdaRole(scope: cdk.Construct) {
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
  scope: cdk.Construct,
  fileName: string,
  role: iam.Role,
  albName: string,
  targetName: string,
) {
  const artifactsFilePath = fs.readFileSync(path.join(__dirname, 'artifacts', fileName));
  const elbLambdaFunction = new lambda.Function(scope, `ElbLambdaFunction${albName}${targetName}`, {
    runtime: lambda.Runtime.NODEJS_12_X,
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
  scope: cdk.Construct,
  target: AlbTargetConfig,
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
    targets: instanceIds.map(instanceId => ({
      id: instanceId,
      port: target.port,
    })),
  });
}

export function createTargetGroupForLambda(
  scope: cdk.Construct,
  target: AlbTargetConfig,
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
  targetInstances: AlbTargetInstanceConfig[],
): string[] {
  const firewallInstances = FirewallInstanceOutputFinder.findAll({
    outputs,
    accountKey,
  });
  const instanceIds = [];
  for (const target of targetInstances) {
    if (AlbTargetInstanceFirewallConfigType.is(target)) {
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
const ALB_MAX_LENGTH = 32;
const ACCOUNT_ID_LENGTH = 12;

/**
 * Creates an ALB name based on the ALB name and the given account key. The returned name will not exceed 32 characters.
 */
export function createAlbName(props: { albName: string; accountKey: string }): string {
  const { albName, accountKey } = props;
  const result = albName + '-' + accountKey + ALB_NAME_SUFFIX;
  if (result.length > ALB_MAX_LENGTH) {
    // Use account ID instead of account key and trim the ALB name
    // -1 for the additional dash
    const albNameLength = ALB_MAX_LENGTH - (1 + ACCOUNT_ID_LENGTH + ALB_NAME_SUFFIX.length);
    return albName.substring(0, albNameLength) + '-' + cdk.Aws.ACCOUNT_ID + ALB_NAME_SUFFIX;
  }
  return result;
}

/**
 * Creates a target group name based on the ALB name and the given target group name. The returned name will not exceed
 * 32 characters.
 */
export function createTargetGroupName(props: { albName: string; targetGroupName: string }): string {
  const { albName, targetGroupName } = props;
  const result = albName + '-' + targetGroupName;
  if (result.length > ALB_MAX_LENGTH) {
    const partLength = ALB_MAX_LENGTH / 2;
    // -1 for the additional dash
    return albName.substring(0, partLength - 1) + '-' + targetGroupName.substring(0, partLength);
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
