import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AcceleratorConfig, AlbConfig, AlbTargetConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Alb } from '../../common/alb';
import { pascalCase } from 'pascal-case';
import * as lambda from '@aws-cdk/aws-lambda';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import * as fs from 'fs';
import { CfnTargetGroup } from '@aws-cdk/aws-elasticloadbalancingv2';
import { createCertificateSecretName } from '../certificates';
import {
  createAlbName,
  createTargetGroupName,
  getEc2Instances,
  getVpc,
  getSubnetIds,
  getAesLogArchiveBucket,
  getSecurityGroup,
} from './outputs';

export interface AlbStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  vpcOutputs: Vpc[];
  outputs: StackOutput[];
}

export async function step1(props: AlbStep1Props) {
  const { accountStacks, config, vpcOutputs, outputs } = props;

  const logArchiveAccountKey = config['global-options']['central-log-services'].account;
  const aesLogArchiveBucketName = getAesLogArchiveBucket(outputs, logArchiveAccountKey);
  if (!aesLogArchiveBucketName) {
    return;
  }

  for (const { accountKey, albs } of config.getAlbConfigs()) {
    if (albs.length === 0) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    for (const alb of albs) {
      const certificateName = createCertificateSecretName(alb['cert-name']);
      const secretValue = cdk.SecretValue.secretsManager(certificateName);
      await createAlb(
        accountKey,
        alb,
        accountStack,
        vpcOutputs,
        outputs,
        secretValue.toString(),
        aesLogArchiveBucketName,
      );
    }
  }
}

export async function createAlb(
  accountKey: string,
  alb: AlbConfig,
  accountStack: AcceleratorStack,
  vpcOutputs: Vpc[],
  outputs: StackOutput[],
  certificateArn: string,
  aesLogArchiveBucketName: string,
) {
  const vpc = getVpc(vpcOutputs, alb.vpc);
  if (!vpc) {
    return;
  }

  const subnetIds = getSubnetIds(vpc, alb.subnets);
  if (!subnetIds) {
    return;
  }

  const securityGroup = getSecurityGroup(alb['security-group'], vpc);
  if (!securityGroup) {
    return;
  }

  let targetGroups: string[];
  const isTargetLambda = alb.targets.find(t => t['lambda-filename'] !== undefined);
  if (isTargetLambda) {
    targetGroups = await getTargetGroupArnsForLambda(accountStack, accountKey, alb);
  } else {
    targetGroups = await getTargetGroupArnsForInstance(accountStack, accountKey, alb, outputs, vpc.id);
  }

  new Alb(accountStack, `Alb${pascalCase(accountKey)}${alb.name}`, {
    albName: createAlbName(accountKey, alb.name),
    scheme: alb.scheme,
    subnetIds,
    securityGroupIds: [securityGroup.id],
    bucketName: aesLogArchiveBucketName,
    certificateArn,
    targetGroupArns: targetGroups,
    hasAccessLogs: alb['access-logs'] ? true : false,
    port: alb.ports,
    protocol: alb.listeners,
    actionType: alb['action-type'],
    ipType: alb['ip-type'],
    securityPolicy: alb['security-policy'],
  });
}

export async function getTargetGroupArnsForLambda(accountStack: AcceleratorStack, accountKey: string, alb: AlbConfig) {
  const targetGroups: string[] = [];
  const role = await createLambdaRole(accountStack, accountKey);
  for (const target of alb.targets) {
    if (!target['lambda-filename']) {
      continue;
    }
    const fileName = target['lambda-filename'];
    const lambdaArn = await getLambdaFunctionArn(accountStack, fileName, role, alb.name, target['target-name']);

    const targetGroupName = createTargetGroupName(alb.name, target['target-name']);
    const targetGroup = await createTargetGroupForLambda(accountStack, target, targetGroupName, lambdaArn);
    targetGroups.push(targetGroup.ref);
  }
  return targetGroups;
}

export async function getTargetGroupArnsForInstance(
  accountStack: AcceleratorStack,
  accountKey: string,
  alb: AlbConfig,
  outputs: StackOutput[],
  vpcId: string,
) {
  const targetGroups: string[] = [];
  for (const target of alb.targets) {
    if (!target['target-instances'] || target['target-instances'].length === 0) {
      continue;
    }
    const ec2Instances = getEc2Instances(accountKey, outputs, target['target-instances']);
    if (!ec2Instances) {
      continue;
    }
    const targetGroupName = createTargetGroupName(alb.name, target['target-name']);
    const targetGroup = await createTargetGroupForInstance(accountStack, target, targetGroupName, vpcId, ec2Instances);
    targetGroups.push(targetGroup.ref);
  }
  return targetGroups;
}

export async function createLambdaRole(scope: cdk.Construct, ouAccount: string) {
  const elbLambdaAccessRole = new iam.Role(scope, `ElbLambdaAccessRole${ouAccount}`, {
    roleName: 'ElbLambdaAccessRole',
    assumedBy: new iam.CompositePrincipal(
      new iam.ServicePrincipal('elasticloadbalancing.amazonaws.com'),
      new iam.ServicePrincipal('lambda.amazonaws.com'),
      new iam.AccountPrincipal(cdk.Aws.ACCOUNT_ID),
    ),
    managedPolicies: [
      iam.ManagedPolicy.fromManagedPolicyArn(
        scope,
        `LambdaVPCAccessRole${ouAccount}`,
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

export async function getLambdaFunctionArn(
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
    handler: 'index.elb',
    role,
  });

  new lambda.CfnPermission(scope, `InvokePermission${albName}${targetName}`, {
    functionName: elbLambdaFunction.functionArn,
    action: 'lambda:InvokeFunction',
    principal: 'elasticloadbalancing.amazonaws.com',
  });

  return elbLambdaFunction.functionArn;
}

export async function createTargetGroupForInstance(
  scope: cdk.Construct,
  target: AlbTargetConfig,
  targetGroupName: string,
  vpcId: string,
  instances: { [instanceName: string]: string },
) {
  const targetGroup = new CfnTargetGroup(scope, `AlbTargetGroup${targetGroupName}`, {
    name: targetGroupName,
    targetType: target['target-type'],
    protocol: target.protocol,
    port: target.port,
    vpcId,
    healthCheckProtocol: target['health-check-protocol'],
    healthCheckPath: target['health-check-path'],
    healthCheckPort: String(target['health-check-port']),
  });
  if (target['target-instances']) {
    const targets = target['target-instances'].map(instance => ({
      id: instances[instance],
      port: target.port,
    }));
    targetGroup.targets = targets;
  }
  return targetGroup;
}

export async function createTargetGroupForLambda(
  scope: cdk.Construct,
  target: AlbTargetConfig,
  targetGroupName: string,
  lambdaFunctionArn: string,
) {
  const targetGroup = new CfnTargetGroup(scope, `AlbTargetGroup${targetGroupName}`, {
    name: targetGroupName,
    targetType: target['target-type'],
    healthCheckPath: target['health-check-path'],
    healthCheckEnabled: true,
  });
  if (target['lambda-filename']) {
    targetGroup.targets = [
      {
        id: lambdaFunctionArn,
      },
    ];
  }
  return targetGroup;
}
