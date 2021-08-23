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
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { Key } from '@aws-cdk/aws-kms';
import { AccountPrincipal, ServicePrincipal } from '@aws-cdk/aws-iam';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import {
  createLogGroupName,
  createEncryptionKeyName,
} from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { getVpcSharedAccountKeys } from '../../common/vpc-subnet-sharing';
import { Account } from '../../utils/accounts';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { SSMSessionManagerDocument } from '@aws-accelerator/custom-resource-ssm-session-manager-document';
import { AccountBuckets, CfnSsmKmsOutput } from '../defaults';

export interface SSMStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  bucketName: string;
  accounts: Account[];
  outputs: StackOutput[];
  accountBuckets: AccountBuckets;
}

export type AccountRegionSSMKeys = { [accountKey: string]: { [region: string]: Key } | undefined };

export async function step1(props: SSMStep1Props) {
  const { accountStacks, accounts, config, outputs, accountBuckets } = props;
  const logArchiveAccountKey = config['global-options']['central-log-services'].account;
  const logBucket = accountBuckets[logArchiveAccountKey];
  const accountRegionSsmDocuments: AccountRegionSSMKeys = {};
  for (const { accountKey, vpcConfig, ouKey } of config.getVpcConfigs()) {
    const region = vpcConfig.region;
    const vpcSharedTo = getVpcSharedAccountKeys(accounts, vpcConfig, ouKey);
    vpcSharedTo.push(accountKey);
    const accountKeys = Array.from(new Set(vpcSharedTo));
    for (const localAccountKey of accountKeys) {
      if (accountRegionSsmDocuments[localAccountKey]?.[region]) {
        console.log(`SSMDocument is already created in account ${localAccountKey} and region ${region}`);
        continue;
      }
      const accountStack = accountStacks.tryGetOrCreateAccountStack(localAccountKey, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${localAccountKey}`);
        continue;
      }

      const ssmDocumentRole = IamRoleOutputFinder.tryFindOneByName({
        outputs,
        accountKey: localAccountKey,
        roleKey: 'SSMDocumentRole',
      });

      const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
        outputs,
        accountKey: localAccountKey,
        roleKey: 'LogGroupRole',
      });
      if (!logGroupLambdaRoleOutput) {
        continue;
      }

      if (!ssmDocumentRole) {
        console.error(`${localAccountKey}:: No Role created for SSMCreateDocument`);
        continue;
      }

      const keyAlias = createEncryptionKeyName('SSM-Key');
      const ssmKey = new Key(accountStack, 'SSM-Key', {
        alias: `alias/${keyAlias}`,
        trustAccountIdentities: true,
        description: 'Key used to encrypt/decrypt SSM',
        enableKeyRotation: true,
      });
      ssmKey.grantEncryptDecrypt(new AccountPrincipal(cdk.Aws.ACCOUNT_ID));
      ssmKey.grantEncryptDecrypt(new ServicePrincipal('logs.amazonaws.com'));

      const logGroup = new LogGroup(accountStack, 'SSMLogGroup', {
        logGroupName: createLogGroupName('SSM'),
        roleArn: logGroupLambdaRoleOutput.roleArn,
        kmsKeyId: ssmKey.keyArn,
      });
      const globalOptionsConfig = config['global-options'];
      const useS3 = globalOptionsConfig['central-log-services']['ssm-to-s3'];
      const useCWL = globalOptionsConfig['central-log-services']['ssm-to-cwl'];

      const ssmDocument = new SSMSessionManagerDocument(accountStack, 'CreateSSMSessionManagerDocument', {
        roleArn: ssmDocumentRole.roleArn,
        s3BucketName: logBucket.bucketName,
        cloudWatchEncryptionEnabled: useCWL,
        cloudWatchLogGroupName: logGroup.logGroupName,
        kmsKeyId: ssmKey.keyId,
        s3EncryptionEnabled: useS3,
        s3KeyPrefix: `/${accountStack.accountId}/${accountStack.region}/SSM/`,
      });
      ssmDocument.node.addDependency(logGroup);
      ssmDocument.node.addDependency(ssmKey);
      accountRegionSsmDocuments[localAccountKey] = {
        ...accountRegionSsmDocuments[localAccountKey],
        [region]: ssmKey,
      };

      new CfnSsmKmsOutput(accountStack, 'SsmEncryptionKey', {
        encryptionKeyName: keyAlias,
        encryptionKeyId: ssmKey.keyId,
        encryptionKeyArn: ssmKey.keyArn,
      });
    }
  }
}
