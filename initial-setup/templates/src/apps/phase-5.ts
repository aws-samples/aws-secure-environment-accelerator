import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import * as iam from '@aws-cdk/aws-iam';
import { SecretsContainer } from '@aws-pbmm/common-cdk/lib/core/secrets-container';
import { VpcOutput } from '../deployments/vpc';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { UserSecret, ADUsersAndGroups } from '../common/ad-users-groups';
import * as ssm from '@aws-cdk/aws-ssm';
import { KeyPairContainer } from '@aws-pbmm/common-cdk/lib/core/key-pair';
import { AccountStacks } from '../common/account-stacks';
import { StructuredOutput } from '../common/structured-output';
import { MadAutoScalingRoleOutputType } from '../deployments/mad';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

export interface RdgwArtifactsOutput {
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

interface MadOutput {
  id: number;
  vpcName: string;
  directoryId: string;
  dnsIps: string;
  passwordArn: string;
}

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();
  const accountNames = acceleratorConfig
    .getMandatoryAccountConfigs()
    .map(([_, accountConfig]) => accountConfig['account-name']);

  const app = new cdk.App();

  const accountStacks = new AccountStacks(app, {
    phase: 5,
    accounts,
    context,
  });

  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const masterStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  const secretsStack = new SecretsContainer(masterStack, 'Secrets');

  // TODO Move to deployments/mad/step-x.ts
  type UserSecrets = UserSecret[];
  for (const [accountKey, accountConfig] of acceleratorConfig.getMandatoryAccountConfigs()) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }

    const madAutoScalingRoleOutputs = StructuredOutput.fromOutputs(outputs, {
      accountKey,
      type: MadAutoScalingRoleOutputType,
    });
    if (madAutoScalingRoleOutputs.length !== 1) {
      console.warn(`Cannot find required service-linked auto scaling role in account "${accountKey}"`);
      continue;
    }
    const madAutoScalingRoleOutput = madAutoScalingRoleOutputs[0];

    const accountId = getAccountId(accounts, accountKey);

    const ec2KeyPairName = 'rdgw-key-pair';
    const ec2KeyPairPrefix = `accelerator/${accountKey}/mad/ec2-private-key/`;

    const stack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!stack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const keyPairContainer = new KeyPairContainer(stack, 'Ec2KeyPair');

    const keyPair = keyPairContainer.createKeyPair('RDGWEc2KeyPair', {
      name: ec2KeyPairName,
      description: 'This is a Key Pair for RDGW host instance',
      secretPrefix: ec2KeyPairPrefix,
      principal: new iam.AccountPrincipal(accountId),
    });

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

    const latestRdgwAmiId = ssm.StringParameter.valueForTypedStringParameter(
      stack,
      '/aws/service/ami-windows-latest/Windows_Server-2016-English-Full-Base',
      ssm.ParameterType.AWS_EC2_IMAGE_ID,
    );

    const rdgwScriptsOutput: RdgwArtifactsOutput[] = getStackJsonOutput(outputs, {
      accountKey: masterAccountKey,
      outputType: 'RdgwArtifactsOutput',
    });

    if (rdgwScriptsOutput.length === 0) {
      console.warn(`Cannot find output with RDGW reference artifacts`);
      continue;
    }

    const s3BucketName = rdgwScriptsOutput[0].bucketName;
    const S3KeyPrefix = rdgwScriptsOutput[0].keyPrefix;
    console.log('RDGW reference scripts s3 bucket name with key ', s3BucketName, S3KeyPrefix);

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(output => output.vpcName === madDeploymentConfig['vpc-name']);
    if (!vpcOutput) {
      console.warn(`Cannot find output with vpc name ${madDeploymentConfig['vpc-name']}`);
      continue;
    }

    const vpcId = vpcOutput.vpcId;
    const vpcName = vpcOutput.vpcName;
    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === madDeploymentConfig.subnet).map(s => s.subnetId);

    const madOutputs: MadOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'MadOutput',
    });

    const madOutput = madOutputs.find(output => output.id === madDeploymentConfig['dir-id']);
    if (!madOutput || !madOutput.directoryId) {
      console.warn(`Cannot find madOutput with vpc name ${madDeploymentConfig['vpc-name']}`);
      continue;
    }

    const adUsersAndGroups = new ADUsersAndGroups(stack, 'RDGWHost', {
      madDeploymentConfig,
      latestRdgwAmiId,
      vpcId,
      vpcName,
      keyPairName: ec2KeyPairName,
      subnetIds,
      adminPasswordArn: madOutput.passwordArn,
      s3BucketName,
      s3KeyPrefix: S3KeyPrefix,
      stackId: stack.stackId,
      stackName: stack.stackName,
      accountNames,
      userSecrets,
      accountKey,
      serviceLinkedRoleArn: madAutoScalingRoleOutput.roleArn,
    });
    adUsersAndGroups.node.addDependency(keyPair);
  }
}

// tslint:disable-next-line: no-floating-promises
main();
