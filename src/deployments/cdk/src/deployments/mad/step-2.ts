/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as kms from '@aws-cdk/aws-kms';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import { Grant as KeyGrant, GrantOperation } from '@aws-accelerator/custom-resource-kms-grant';
import { AcceleratorConfig, MadDeploymentConfig } from '@aws-accelerator/common-config/src';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { AccountStacks, AccountStack } from '../../common/account-stacks';
import { getMadUserPasswordSecretArn, getMadRootPasswordSecretArn } from './outputs';
import { StructuredOutput } from '../../common/structured-output';
import { SecretEncryptionKeyOutputType } from '../secrets';
import { JsonOutputValue } from '../../common/json-output';
import { ActiveDirectory } from '../../common/active-directory';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';

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

/**
 * Create Active Directory and a log group.
 */
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

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, madConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      vpcName: madConfig['vpc-name'],
    });
    if (!vpcOutput) {
      console.warn(`Cannot find output with vpc name ${madConfig['vpc-name']}`);
      continue;
    }

    const vpcId = vpcOutput.vpcId;
    let subnetIds: string[];
    if (madConfig.azs.length > 0) {
      const madAzs = madConfig.azs.slice(0, 2);
      subnetIds = vpcOutput.subnets
        .filter(s => s.subnetName === madConfig.subnet && madAzs.includes(s.az))
        .map(s => s.subnetId);
    } else {
      subnetIds = vpcOutput.subnets
        .filter(s => s.subnetName === madConfig.subnet)
        .map(s => s.subnetId)
        .slice(0, 2);
    }
    // TODO Check that `subnetIds` is not empty

    const madPasswordSecretArn = getMadConfigRootPasswordSecretArn({
      acceleratorPrefix,
      accountKey,
      madConfig,
      secretAccountId: masterAccountStack.accountId,
    });
    const madPasswordSecret = cdk.SecretValue.secretsManager(madPasswordSecretArn);

    const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'LogGroupRole',
    });
    if (!logGroupLambdaRoleOutput) {
      continue;
    }

    const activeDirectory = new ActiveDirectory(accountStack, 'Microsoft AD', {
      madDeploymentConfig: madConfig,
      subnetInfo: {
        vpcId,
        subnetIds,
      },
      password: madPasswordSecret,
      roleArn: logGroupLambdaRoleOutput.roleArn,
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

/**
 * Grant the Accelerator role and the RDWG role access to the MAD root and user passwords. This function creates KMS
 * key grants and secret policies.
 */
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

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, madConfig.region);
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
  madConfig: MadDeploymentConfig;
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
  return `arn:aws:secretsmanager:${madConfig.region}:${secretAccountId}:secret:${madPasswordSecretName}`;
}
