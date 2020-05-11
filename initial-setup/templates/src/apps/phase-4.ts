import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import * as iam from '@aws-cdk/aws-iam';
import { pascalCase } from 'pascal-case';
import { SecretsStack } from '@aws-pbmm/common-cdk/lib/core/secrets-stack';
import { VpcOutput } from './phase-1';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { UserSecret, ADUsersAndGroups } from '../common/ad-users-groups';
import * as ssm from '@aws-cdk/aws-ssm';
import { KeyPairStack } from '@aws-pbmm/common-cdk/lib/core/key-pair';
import { InterfaceEndpointConfig } from '@aws-pbmm/common-lambda/lib/config';
import { ResolversOutput } from './phase-2';
import { Route53ResolverRuleSharing } from '../common/r53-resolver-rule-sharing';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

type ResolversOutputs = ResolversOutput[];

export interface RdgwArtifactsOutput {
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();
  const accountNames = Object.values(acceleratorConfig['mandatory-account-configs']).map(a => a['account-name']);

  const app = new cdk.App();

  const masterStack = new AcceleratorStack(app, 'MasterStack', {
    env: {
      account: getAccountId(accounts, 'master'),
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-Secrets',
  });
  const secretsStack = new SecretsStack(masterStack, 'Secrets');

  type UserSecrets = UserSecret[];
  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }
    const accountId = getAccountId(accounts, accountKey);
    const madAdminPassword = secretsStack.createSecret('MadPassword', {
      secretName: `accelerator/${accountKey}/mad/password`,
      description: 'Password for Managed Active Directory.',
      generateSecretString: {
        passwordLength: 16,
      },
      principals: [new iam.AccountPrincipal(accountId)],
    });

    const ec2KeyPairName = 'rdgw-key-pair';
    const ec2KeyPairPrefix = `accelerator/${accountKey}/mad/ec2-private-key/`;

    const keyPairStack = new KeyPairStack(app, 'Ec2KeyPair', {
      env: {
        account: accountId,
        region: cdk.Aws.REGION,
      },
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
      stackName: 'PBMMAccel-Ec2KeyPair',
    });

    keyPairStack.createKeyPair(
      'RDGWEc2KeyPair',
      {
        name: ec2KeyPairName,
        description: 'This is a Key Pair for RDGW host instance',
        secretPrefix: ec2KeyPairPrefix,
      },
      new iam.AccountPrincipal(accountId),
    );

    const userSecrets: UserSecrets = [];
    for (const adUser of madDeploymentConfig['ad-users']) {
      const madUserPassword = secretsStack.createSecret(`MadPassword${adUser.user}`, {
        secretName: `accelerator/${accountKey}/mad/${adUser.user}/password`,
        description: 'Password for Managed Active Directory.',
        generateSecretString: {
          passwordLength: madDeploymentConfig['password-policies']['min-len'],
        },
        principals: [new iam.AccountPrincipal(accountId)],
      });
      userSecrets.push({ user: adUser.user, password: madUserPassword });
    }

    const stack = new AcceleratorStack(app, 'ADUsersAndGroups', {
      env: {
        account: accountId,
        region: cdk.Aws.REGION,
      },
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
      stackName: `PBMMAccel-${pascalCase('adUsersAndGroups')}`,
    });

    stack.addDependency(keyPairStack);

    const latestRdgwAmiId = ssm.StringParameter.valueForTypedStringParameter(
      stack,
      '/aws/service/ami-windows-latest/Windows_Server-2016-English-Full-Base',
      ssm.ParameterType.AWS_EC2_IMAGE_ID,
    );

    const rdgwScriptsOutput: RdgwArtifactsOutput[] = getStackJsonOutput(outputs, {
      accountKey: 'master',
      outputType: 'RdgwArtifactsOutput',
    });

    if (rdgwScriptsOutput.length === 0) {
      throw new Error(`Cannot find output with RDGW reference artifacts`);
    }

    const s3BucketName = rdgwScriptsOutput[0].bucketName;
    const S3KeyPrefix = rdgwScriptsOutput[0].keyPrefix + '/';
    console.log('RDGW reference scripts s3 bucket name with key ', s3BucketName, S3KeyPrefix);

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(output => output.vpcName === madDeploymentConfig['vpc-name']);
    if (!vpcOutput) {
      throw new Error(`Cannot find output with vpc name ${madDeploymentConfig['vpc-name']}`);
    }

    const vpcId = vpcOutput.vpcId;
    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === madDeploymentConfig.subnet).map(s => s.subnetId);

    new ADUsersAndGroups(stack, 'RDGWHost', {
      madDeploymentConfig,
      latestRdgwAmiId,
      vpcId,
      keyPairName: ec2KeyPairName,
      subnetIds,
      adminPassword: madAdminPassword,
      s3BucketName,
      s3KeyPrefix: S3KeyPrefix,
      stackId: stack.stackId,
      stackName: stack.stackName,
      accountNames,
      userSecrets,
    });
  }


  // to share the resolver rules
  // get the list of account IDs with which the resolver rules needs to be shared
  const vpcConfigs = acceleratorConfig.getVpcConfigs();
  const sharedAccountIds: string[] = [];
  let hostedZonesAccountId: string = '';
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    if (InterfaceEndpointConfig.is(vpcConfig['interface-endpoints'])) {
      hostedZonesAccountId = getAccountId(accounts, accountKey);
    }

    if (vpcConfig['use-central-endpoints']) {
      const accountId = getAccountId(accounts, accountKey);
      if (accountId !== hostedZonesAccountId) {
        sharedAccountIds.push(accountId);
      }
    }
  }

  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const resolverRuleArns: string[] = [];
    if (vpcConfig.resolvers) {
      const accountId = getAccountId(accounts, accountKey);

      const resolversOutputs: ResolversOutputs[] = getStackJsonOutput(outputs, {
        accountKey,
        outputType: 'GlobalOptionsOutput',
      });

      for (const resolversOutput of resolversOutputs) {
        const resolverOutput = resolversOutput.find(x => x.vpcName === vpcConfig.name);
        if (!resolverOutput) {
          throw new Error(
            `No Resolver Rules found in outputs for account key ${accountKey} and VPC name ${vpcConfig.name}`,
          );
        }

        resolverRuleArns.push(
          `arn:aws:route53resolver:${cdk.Aws.REGION}:${accountId}:resolver-rule/${resolverOutput.rules?.inBoundRule!}`,
        );
        resolverOutput.rules?.onPremRules?.map(x =>
          resolverRuleArns.push(`arn:aws:route53resolver:${cdk.Aws.REGION}:${accountId}:resolver-rule/${x}`),
        );
      }

      const r53ResolverRulesSharingStack = new AcceleratorStack(
        app,
        `PBMMAccel-Route53ResolverRulesSharing-${accountKey}Stack`,
        {
          env: {
            account: accountId,
            region: cdk.Aws.REGION,
          },
          acceleratorName: context.acceleratorName,
          acceleratorPrefix: context.acceleratorPrefix,
          stackName: `PBMMAccel-Route53ResolverRulesSharing-${pascalCase(accountKey)}Stack`,
        },
      );

      const route53ResolverRuleSharing = new Route53ResolverRuleSharing(
        r53ResolverRulesSharingStack,
        `ShareResolverRulesStack-${pascalCase(accountKey)}`,
        {
          name: 'PBMMAccel-Route53ResolverRulesSharing',
          allowExternalPrincipals: false,
          principals: sharedAccountIds,
          resourceArns: resolverRuleArns,
        },
      );
    }
  }
}

// tslint:disable-next-line: no-floating-promises
main();
