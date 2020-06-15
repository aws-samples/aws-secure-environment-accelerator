import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import { Grant as KeyGrant, GrantOperation } from '@custom-resources/kms-grant';
import { AcceleratorConfig, MadConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { getMadUserPasswordSecretArn, getMadRootPasswordSecretArn } from './outputs';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { StructuredOutput } from '../../common/structured-output';
import { SecretEncryptionKeyOutputType } from '../secrets';
import { JsonOutputValue } from '../../common/json-output';
import { ActiveDirectory } from '../../common/active-directory';
import { VpcOutput } from '../vpc';

export interface MadStep2Props {
  acceleratorExecutionRoleName: string;
  acceleratorPrefix: string;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 * Create KMS key grants and secret policies for MAD to access user password secrets.
 */
export async function step2(props: MadStep2Props) {
  createActiveDirectory(props);
  createKeyAndSecretPolicies(props);
}

function createActiveDirectory(props: MadStep2Props) {
  const { acceleratorPrefix, accountStacks, config, outputs } = props;

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  const accountConfigs = config.getAccountConfigs();
  for (const [accountKey, accountConfig] of accountConfigs) {
    const madConfig = accountConfig.deployments?.mad;
    if (!madConfig || !madConfig.deploy) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(output => output.vpcName === madConfig['vpc-name']);
    if (!vpcOutput) {
      console.warn(`Cannot find output with vpc name ${madConfig['vpc-name']}`);
      continue;
    }

    const vpcId = vpcOutput.vpcId;
    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === madConfig.subnet).map(s => s.subnetId);

    const madPasswordSecretArn = getMadConfigRootPasswordSecretArn({
      acceleratorPrefix,
      accountKey,
      madConfig: madConfig,
      secretAccountId: masterAccountStack.accountId,
    });
    const madPasswordSecret = cdk.SecretValue.secretsManager(madPasswordSecretArn);

    const activeDirectory = new ActiveDirectory(accountStack, 'Microsoft AD', {
      madDeploymentConfig: madConfig,
      subnetInfo: {
        vpcId,
        subnetIds,
      },
      password: madPasswordSecret,
    });

    new JsonOutputValue(accountStack, 'MadOutput', {
      type: 'MadOutput',
      value: {
        id: madConfig['dir-id'],
        vpcName: madConfig['vpc-name'],
        directoryId: activeDirectory.directoryId,
        dnsIps: cdk.Fn.join(',', activeDirectory.dnsIps),
        passwordArn: madPasswordSecretArn,
      },
    });
  }
}

function createKeyAndSecretPolicies(props: MadStep2Props) {
  const { acceleratorExecutionRoleName, acceleratorPrefix, accountStacks, config, outputs } = props;

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  const secretEncryptionKeyOutputs = StructuredOutput.fromOutputs(outputs, {
    type: SecretEncryptionKeyOutputType,
    accountKey: masterAccountKey,
  });
  const secretEncryptionKeyOutput = secretEncryptionKeyOutputs?.[0];
  if (!secretEncryptionKeyOutput) {
    console.log(`Cannot find secret encryption key output`);
    return;
  }

  const masterSecretEncryptionKey = kms.Key.fromKeyArn(
    masterAccountStack,
    'SecretEncryptionKey',
    secretEncryptionKeyOutput.encryptionKeyArn,
  );

  for (const [accountKey, accountConfig] of config.getMandatoryAccountConfigs()) {
    const madConfig = accountConfig.deployments?.mad;
    if (!madConfig || !madConfig.deploy) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    // Find the MAD role for the current account
    const madRoleName = madConfig['rdgw-instance-role'];
    const madPrincipal = new iam.ArnPrincipal(`arn:aws:iam::${accountStack.accountId}:role/${madRoleName}`);

    // Grant the MAD role access to decrypt using the secrets encryption key
    new KeyGrant(masterAccountStack, `SecretKeyGrant`, {
      granteePrincipal: madPrincipal,
      key: masterSecretEncryptionKey,
      operations: [GrantOperation.DECRYPT],
    });

    // Grant the Accelerator role access to get secret value
    // Otherwise CloudFormation will not be able to resolve the secret value cross-account
    const acceleratorPrincipal = new iam.ArnPrincipal(
      `arn:aws:iam::${accountStack.accountId}:role/${acceleratorExecutionRoleName}`,
    );

    // Find the MAD root password for this account
    const madPasswordSecretArn = getMadConfigRootPasswordSecretArn({
      acceleratorPrefix,
      accountKey,
      madConfig,
      secretAccountId: masterAccountStack.accountId,
    });
    grantGetSecretValue({
      accountStack: masterAccountStack,
      policyName: `${accountKey}-Root`,
      principals: [madPrincipal, acceleratorPrincipal],
      secretId: madPasswordSecretArn,
    });

    for (const adUser of madConfig['ad-users']) {
      // Find the secret password ARN for the AD user
      const passwordSecretArn = getMadUserPasswordSecretArn({
        acceleratorPrefix,
        accountKey,
        secretAccountId: masterAccountStack.accountId,
        userId: adUser.user,
      });
      grantGetSecretValue({
        accountStack: masterAccountStack,
        policyName: `${accountKey}-User${adUser.user}`,
        principals: [madPrincipal],
        secretId: passwordSecretArn,
      });
    }
  }
}

/**
 * Grant `secretsmanager:GetSecretValue` for the given secret ID for the given principals.
 */
function grantGetSecretValue(props: {
  accountStack: AccountStack;
  policyName: string;
  principals: iam.IPrincipal[];
  secretId: string;
}) {
  const { accountStack, policyName, principals, secretId } = props;
  new secrets.CfnResourcePolicy(accountStack, `SecretPolicy${policyName}`, {
    secretId,
    resourcePolicy: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: ['*'],
          principals,
        }),
      ],
    }),
  });
}

function getMadConfigRootPasswordSecretArn(props: {
  acceleratorPrefix: string;
  accountKey: string;
  madConfig: MadConfig;
  secretAccountId: string;
}) {
  const { acceleratorPrefix, accountKey, madConfig, secretAccountId } = props;
  const madPasswordSecretName = madConfig['password-secret-name'];
  if (!madPasswordSecretName) {
    return getMadRootPasswordSecretArn({
      acceleratorPrefix,
      accountKey,
      secretAccountId,
    });
  }
  return `arn:${cdk.Aws.PARTITION}:secretsmanager:${cdk.Aws.REGION}:${secretAccountId}:secret:${madPasswordSecretName}`;
}
