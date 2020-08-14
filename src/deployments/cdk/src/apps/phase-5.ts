import * as ssm from '@aws-cdk/aws-ssm';
import { getAccountId } from '../utils/accounts';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AcceleratorKeypair } from '@aws-accelerator/cdk-accelerator/src/core/key-pair';
import { MadOutput } from '@aws-accelerator/common-outputs/src/mad';
import { UserSecret, ADUsersAndGroups } from '../common/ad-users-groups';
import { StructuredOutput } from '../common/structured-output';
import { MadAutoScalingRoleOutputType, getMadUserPasswordSecretArn } from '../deployments/mad';
import * as ouValidation from '../deployments/ou-validation-events';
import { PhaseInput } from './shared';
import { RdgwArtifactsOutput } from './phase-4';
import * as cwlCentralLoggingToS3 from '../deployments/central-services/central-logging-s3';
import { ArtifactOutputFinder } from '../deployments/artifacts/outputs';
import { ImageIdOutputFinder } from '@aws-accelerator/common-outputs/src/ami-output';

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
    const madConfig = accountConfig.deployments?.mad;
    if (!madConfig || !madConfig.deploy) {
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

    const stack = accountStacks.tryGetOrCreateAccountStack(accountKey, madConfig.region);
    if (!stack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const keyPair = new AcceleratorKeypair(stack, 'RDGWEc2KeyPair', {
      name: 'rdgw-key-pair',
    });

    const userSecrets: UserSecrets = [];
    for (const adUser of madConfig['ad-users']) {
      const passwordSecretArn = getMadUserPasswordSecretArn({
        acceleratorPrefix: context.acceleratorPrefix,
        accountKey,
        secretAccountId: masterAccountId,
        userId: adUser.user,
      });
      userSecrets.push({ user: adUser.user, passwordSecretArn });
    }

    const madAutoScalingImageIdOutput = ImageIdOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      imageKey: 'MadAutoScalingImageId',
    });
    if (!madAutoScalingImageIdOutput) {
      console.warn(`Cannot find required auto scaling Image Id in account "${accountKey}"`);
      continue;
    }

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

    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      vpcName: madConfig['vpc-name'],
    });
    if (!vpcOutput) {
      console.warn(`Cannot find output with vpc name ${madConfig['vpc-name']}`);
      continue;
    }

    const vpcId = vpcOutput.vpcId;
    const vpcName = vpcOutput.vpcName;
    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === madConfig.subnet).map(s => s.subnetId);

    const madOutputs: MadOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'MadOutput',
    });

    const madOutput = madOutputs.find(output => output.id === madConfig['dir-id']);
    if (!madOutput || !madOutput.directoryId) {
      console.warn(`Cannot find madOutput with vpc name ${madConfig['vpc-name']}`);
      continue;
    }

    const adUsersAndGroups = new ADUsersAndGroups(stack, 'RDGWHost', {
      madDeploymentConfig: madConfig,
      latestRdgwAmiId: madAutoScalingImageIdOutput.imageId,
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
    outputs,
  });

  const { acceleratorBaseline } = context;

  if (acceleratorBaseline === 'ORGANIZATIONS') {
    const masterStack = accountStacks.getOrCreateAccountStack(masterAccountKey, 'us-east-1');
    if (!masterStack) {
      console.error(`Not able to create stack for "${masterAccountKey}"`);
    } else {
      // Find the SCP artifact output
      const artifactOutput = ArtifactOutputFinder.findOneByName({
        outputs,
        artifactName: 'SCP',
      });
      const scpBucketName = artifactOutput.bucketName;
      const scpBucketPrefix = artifactOutput.keyPrefix;
      const ignoredOus = acceleratorConfig['global-options']['ignored-ous'] || [];
      const organizationAdminRole = acceleratorConfig['global-options']['organization-admin-role']!;

      await ouValidation.step1({
        scope: masterStack,
        context,
        scpBucketName,
        scpBucketPrefix,
        ignoredOus,
        organizationAdminRole,
      });
    }
  }
}
