import * as fs from 'fs';
import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as alb from '@aws-cdk/aws-elasticloadbalancingv2';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import { ApplicationLoadBalancer } from '@aws-pbmm/constructs/lib/vpc';
import { AcceleratorConfig, AlbConfig, AlbTargetConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { createCertificateSecretName } from '../certificates';
import { AesBucketOutput } from '../defaults';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { FirewallInstanceOutputType } from '../firewall/cluster/outputs';
import { StructuredOutput } from '../../common/structured-output';
import { VpcOutput, SecurityGroupsOutput } from '../vpc';

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

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    for (const albConfig of albConfigs) {
      const vpcConfig = vpcConfigs.find(v => v.vpcConfig.name === albConfig.vpc)?.vpcConfig;
      if (!vpcConfig) {
        console.warn(`Cannot find vpc config with name ${albConfig.vpc}`);
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
  const allVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
    outputType: 'VpcOutput',
  });
  const vpc = allVpcOutputs.find(v => v.vpcName === albConfig.vpc);
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
    albName: `${albConfig.name}-${accountKey}-alb`,
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

  const targetGroupName = `${albConfig.name}-${targetConfig['target-name']}`;
  if (targetConfig['lambda-filename']) {
    const fileName = targetConfig['lambda-filename'];
    const lambdaArn = getLambdaFunctionArn(accountStack, fileName, role, albConfig.name, targetConfig['target-name']);

    return createTargetGroupForLambda(accountStack, targetConfig, targetGroupName, lambdaArn);
  } else if (targetConfig['target-instances']) {
    const ec2Instances = getEc2Instances(accountKey, outputs, targetConfig['target-instances']);
    if (!ec2Instances) {
      return;
    }
    return createTargetGroupForInstance(accountStack, targetConfig, targetGroupName, vpcId, ec2Instances);
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

  elbLambdaAccessRole.addToPolicy(
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
  instances: { [instanceName: string]: string },
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
    targets: Object.values(instances).map(instanceId => ({
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

export function getEc2Instances(
  accountKey: string,
  outputs: StackOutput[],
  targetInstances: string[],
): { [instanceName: string]: string } | undefined {
  const instanceOutputs = StructuredOutput.fromOutputs(outputs, {
    type: FirewallInstanceOutputType,
    accountKey,
  });
  const ec2Instances: { [instanceName: string]: string } = {};
  for (const instanceName of targetInstances) {
    const instance = instanceOutputs.find(i => i.name === instanceName);
    if (!instance) {
      console.warn(`Cannot find output with ALB instance name ${instanceName}`);
      return;
    }
    ec2Instances[instanceName] = instance.id;
  }
  return ec2Instances;
}
