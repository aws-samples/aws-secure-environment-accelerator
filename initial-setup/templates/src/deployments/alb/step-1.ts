import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as path from 'path';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AcceleratorConfig, AlbConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { getStackJsonOutput, StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Alb } from '../../common/alb';
import { pascalCase } from 'pascal-case';
import { Account } from '../../utils/accounts';
import * as lambda from '@aws-cdk/aws-lambda';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import * as fs from 'fs';

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

export async function step1(props: AlbStep1Props) {
  const { accountStacks, config, vpcOutputs, outputs, accounts } = props;

  const getNonMandatoryAccountsPerOu = (ouName: string, mandatoryAccKeys: string[]): Account[] => {
    const accountsPerOu: Account[] = [];
    for (const account of accounts) {
      if (account.ou === ouName && !mandatoryAccKeys.includes(account.key)) {
        accountsPerOu.push(account);
      }
    }
    return accountsPerOu;
  };

  // creating Albs for account configs
  const mandatoryAccountKeys: string[] = [];
  for (const [accountKey, accountConfig] of config.getMandatoryAccountConfigs()) {
    mandatoryAccountKeys.push(accountKey);
    const albConfig = accountConfig.alb;
    if (!albConfig) {
      continue;
    }

    // TODO get the account specific certificate arn
    const certificates = getStackJsonOutput(outputs, {
      outputType: 'Certificates',
      accountKey,
    });
    if (!certificates) {
      continue;
    }
    const certificateArn = certificates[0].arn;

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    for (const alb of Object.values(albConfig)) {
      await createAlb(accountKey, alb, accountStack, vpcOutputs, outputs, certificateArn, false);
    }
  }

  // creating Albs for org unit accounts
  const orgUnits = config.getOrganizationalUnits();
  for (const [orgName, orgConfig] of orgUnits) {
    const orgAccounts = getNonMandatoryAccountsPerOu(orgName, mandatoryAccountKeys);
    for (const orgAccount of orgAccounts) {
      const albConfig = orgConfig.alb;
      if (!albConfig) {
        continue;
      }
      const accountKey = orgAccount.key;

      // TODO get the account specific certificate arn
      const certificates = getStackJsonOutput(outputs, {
        outputType: 'Certificates',
        accountKey,
      });
      if (!certificates) {
        continue;
      }
      const certificateArn = certificates[0].arn;

      const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
      for (const alb of Object.values(albConfig)) {
        await createAlb(orgAccount.key, alb, accountStack, vpcOutputs, outputs, certificateArn, true);
      }
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
  isOu: boolean,
) {
  const ec2Instances: { [instanceName: string]: string } = {};
  const lambdaSources: { [lambdaFileName: string]: string } = {};
  // let certificateArn: string;

  const vpc = vpcOutputs.find(v => v.name === alb.vpc);
  if (!vpc) {
    throw new Error(`Cannot find output with vpc name ${alb.vpc}`);
  }

  const vpcId = vpc.id;
  const subnetIds = vpc.tryFindSubnetIdsByName(alb.subnets);
  if (!subnetIds) {
    throw new Error(`Cannot find output with subnet name ${alb.subnets}`);
  }

  const logArchiveBuckets: LogArchiveBucketProps[] = getStackJsonOutput(outputs, {
    outputType: 'AccountBucket',
    accountKey: 'log-archive',
  });
  if (logArchiveBuckets.length === 0) {
    throw new Error(`Cannot find output with log-archive AccountBucket`);
  }

  const securityGroup = vpc.tryFindSecurityGroupByName(alb.vpc.concat('-').concat(alb['security-group']));
  if (!securityGroup) {
    throw new Error(`Cannot find output with security name ${alb['security-group']}`);
  }

  if (isOu) {
    const role = await createLambdaRole(accountStack, accountKey);
    for (const target of alb.targets) {
      if (!target['lambda-filename']) {
        continue;
      }
      const fileName = target['lambda-filename'];
      const lambdaArn = await getLambdaFunctionArn(accountStack, fileName, role, alb.name, target['target-name']);
      lambdaSources[fileName] = lambdaArn;
    }
    // certificateArn = 'arn:aws:acm:ca-central-1:722248117416:certificate/ba655f2a-3f53-413b-93c2-b40cd8ff335d';
  } else {
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
      ec2Instances[instanceName] = instance.id;
    }
    // certificateArn = 'arn:aws:acm:ca-central-1:275283254872:certificate/ab542357-1187-46d9-a7a1-259e08a174e0';
  }

  new Alb(accountStack, `Alb${pascalCase(accountKey)}${alb.name}`, {
    albConfig: alb,
    vpcId,
    subnetIds,
    securityGroupIds: [securityGroup.id],
    bucketName: logArchiveBuckets[0].bucketName,
    ec2Instances,
    lambdaSources,
    isOu,
    accountKey,
    certificateArn,
  });
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
