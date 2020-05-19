import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Alb } from '../../common/alb';
import { pascalCase } from 'pascal-case';
import { Account } from '../../utils/accounts';
import * as lambda from '@aws-cdk/aws-lambda';

export interface AlbStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  vpcOutputs: Vpc[];
  outputs: StackOutput[];
  accounts: Account[];
}

interface LogArchiveBucketProps {
  bucketName: string;
  bucketArn: string;
  region: string;
}

interface ElbArtifactsOutput {
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

export async function step1(props: AlbStep1Props) {
  const { accountStacks, config, vpcOutputs, outputs, accounts } = props;

  // const mandatoryAccountKeys: string[] = [];
  // // creating assets for default account settings
  // for (const [accountKey, accountConfig] of mandatoryAccountConfig) {
  //   mandatoryAccountKeys.push(accountKey);
  //   if (accountKey === 'master') {
  //     await createCurBucket(accountKey);
  //   }
  //   await createIamAssets(accountKey, accountConfig.iam);
  // }

  // // creating assets for org unit accounts
  // for (const [orgName, orgConfig] of orgUnits) {
  //   const orgAccounts = getNonMandatoryAccountsPerOu(orgName, mandatoryAccountKeys);
  //   for (const orgAccount of orgAccounts) {
  //     await createIamAssets(orgAccount.key, orgConfig.iam);
  //   }
  // }

  // parsing all the account-configs
  for (const [accountKey, accountConfig] of config.getMandatoryAccountConfigs()) {
    const albConfig = accountConfig.alb;
    if (!albConfig) {
      continue;
    }
    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);

    for (const alb of Object.values(albConfig)) {
      const firewallInstances: { [instanceName: string]: string } = {};
      const vpc = vpcOutputs.find(v => v.name === alb.vpc);
      if (!vpc) {
        console.log(`Cannot find output with vpc name ${alb.vpc}`);
        continue;
      }

      const vpcId = vpc.id;
      const subnetIds = vpc.tryFindSubnetIdsByName(alb.subnets);
      if (!subnetIds) {
        console.log(`Cannot find output with subnet name ${alb.subnets}`);
        continue;
      }

      const logArchiveBuckets: LogArchiveBucketProps[] = getStackJsonOutput(outputs, {
        outputType: 'AccountBucket',
        accountKey: 'log-archive',
      });

      if (logArchiveBuckets.length == 0) {
        console.log(`Cannot find output with log-archive AccountBucket`);
        continue;
      }

      const securityGroup = vpc.tryFindSecurityGroupByName(alb['security-group']);
      if (!securityGroup) {
        console.log(`Cannot find output with security name ${alb['security-group']}`);
        continue;
      }

      for (const target of alb.targets) {
        if (!target['target-instances']) {
          continue;
        }
        const instanceName = target['target-instances'][0];
        const instanceOutputs = getStackJsonOutput(outputs, {
          accountKey,
          outputType: 'FirewallInstanceOutputType',
        });
        const instance = instanceOutputs.find(i => i.name === instanceName);
        if (!instance) {
          throw new Error(`Cannot find output with ALB instance name ${instanceName}`);
        }
        firewallInstances[instanceName] = instance.id;
      }

      new Alb(accountStack, `Alb${pascalCase(accountKey)}${alb.name}`, {
        albConfig: alb,
        vpcId: vpcId,
        subnetIds: subnetIds,
        securityGroupIds: [securityGroup.id],
        bucketName: logArchiveBuckets[0].bucketName,
        instances: firewallInstances,
      });
    }
  }
}

export async function createLambdaRole(scope: cdk.Construct, ouAccount: string) {
  const elbLambdaAccessRole = new iam.Role(scope, `ElbLambdaAccessRole${ouAccount}`, {
    roleName: 'ElbLambdaAccessRole',
    assumedBy: new iam.CompositePrincipal(
      new iam.ServicePrincipal('elasticloadbalancing.amazonaws.com'),
      new iam.ServicePrincipal('lambda.amazonaws.com'),
      new iam.AccountPrincipal(`${cdk.Aws.ACCOUNT_ID}`),
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
  const artifactsFilePath = path.join(__dirname, 'artifacts', fileName);
  const elbLambdaFunction = new lambda.Function(scope, `ElbLambdaFunction${albName}${targetName}`, {
    runtime: lambda.Runtime.NODEJS_12_X,
    code: lambda.Code.fromInline(artifactsFilePath),
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
