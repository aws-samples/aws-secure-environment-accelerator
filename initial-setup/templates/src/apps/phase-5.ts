import * as iam from '@aws-cdk/aws-iam';
import * as ssm from '@aws-cdk/aws-ssm';
import { getAccountId } from '../utils/accounts';
import { VpcOutput } from '../deployments/vpc';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { AcceleratorKeypair } from '@aws-pbmm/common-cdk/lib/core/key-pair';
import { UserSecret, ADUsersAndGroups } from '../common/ad-users-groups';
import { StructuredOutput } from '../common/structured-output';
import { MadAutoScalingRoleOutputType, getMadUserPasswordSecretArn } from '../deployments/mad';
import { PhaseInput } from './shared';
import { RdgwArtifactsOutput } from './phase-4';
import { CentralLoggingSubscriptionFilter } from '@custom-resources/logs-add-subscription-filter';
import * as cwlCentralLoggingToS3 from '../deployments/central-services/central-logging-s3';

interface MadOutput {
  id: number;
  vpcName: string;
  directoryId: string;
  dnsIps: string;
  passwordArn: string;
}

export async function deploy({ acceleratorConfig, accountStacks, accounts, context, outputs }: PhaseInput) {
  const accountNames = acceleratorConfig
    .getMandatoryAccountConfigs()
    .map(([_, accountConfig]) => accountConfig['account-name']);

  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const masterAccountId = getAccountId(accounts, masterAccountKey);
  if (!masterAccountId) {
    throw new Error(`Cannot find mandatory primary account ${masterAccountKey}`);
  }

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

    const stack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!stack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const keyPair = new AcceleratorKeypair(stack, 'RDGWEc2KeyPair', {
      name: 'rdgw-key-pair',
    });

    const userSecrets: UserSecrets = [];
    for (const adUser of madDeploymentConfig['ad-users']) {
      const passwordSecretArn = getMadUserPasswordSecretArn({
        acceleratorPrefix: context.acceleratorPrefix,
        accountKey,
        secretAccountId: masterAccountId,
        userId: adUser.user,
      });
      userSecrets.push({ user: adUser.user, passwordSecretArn });
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
      keyPairName: keyPair.keyName,
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

  /**
   * Central Logging Services step 2
   * Creating Subscription Filters for handling CloudWatch Celtral Logging to S3 in log-archive account
   * Good to have in last phase, since we add subscription filter to all log groups
   */
  await cwlCentralLoggingToS3.step2({
    accountStacks,
    config: acceleratorConfig,
    accounts,
    outputs,
    acceleratorPrefix: context.acceleratorPrefix,
  });
}
