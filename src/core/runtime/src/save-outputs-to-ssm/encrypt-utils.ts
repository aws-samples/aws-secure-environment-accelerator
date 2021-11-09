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

import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { OutputUtilGenericType } from './utils';
import { EbsKmsOutputFinder } from '@aws-accelerator/common-outputs/src/ebs';
import {
  AccountBucketOutputFinder,
  LogBucketOutputTypeOutputFinder,
} from '@aws-accelerator/common-outputs/src/buckets';
import { CentralBucketOutputFinder } from '@aws-accelerator/common-outputs/src/central-bucket';
import { SecretEncryptionKeyOutputFinder } from '@aws-accelerator/common-outputs/src/secrets';
import { AcmOutputFinder } from '@aws-accelerator/common-outputs/src/certificates';
import { SsmKmsOutputFinder } from '@aws-accelerator/common-outputs/src/ssm';

interface KmsOutput {
  id: string;
  name: string;
  arn: string;
}

interface AcmOutput {
  name: string;
  arn: string;
}

export async function saveKmsKeys(
  config: AcceleratorConfig,
  outputs: StackOutput[],
  ssm: SSM,
  account: Account,
  region: string,
  acceleratorPrefix: string,
  kms: OutputUtilGenericType[],
): Promise<OutputUtilGenericType[]> {
  const kmsIndices = kms.flatMap(r => r.index) || [];
  console.log('kmsIndices', kmsIndices);
  let kmsMaxIndex = kmsIndices.length === 0 ? 0 : Math.max(...kmsIndices);
  const updatedKeys: OutputUtilGenericType[] = [];
  const removalObjects: OutputUtilGenericType[] = [...(kms || [])];

  const masterAccount = config['global-options']['aws-org-management'].account;
  const smRegion = config['global-options']['aws-org-management'].region;
  const logAccount = config['global-options']['central-log-services'].account;

  const kmsOutputs: KmsOutput[] = [];

  // Below outputs will be created only in SM region
  if (region === smRegion) {
    // Finding account default bucket KMS keys in other accounts (excluding Log Archive account)
    if (account.key !== logAccount) {
      const accountBuckets = AccountBucketOutputFinder.findAll({
        outputs,
        accountKey: account.key,
        region,
      });
      kmsOutputs.push(
        ...accountBuckets.map(a => ({
          id: a.encryptionKeyId,
          name: a.encryptionKeyName,
          arn: a.encryptionKeyArn,
        })),
      );
    } else {
      // Finding account bucket KMS key if it is Log Archive account
      const logBuckets = LogBucketOutputTypeOutputFinder.findAll({
        outputs,
        accountKey: account.key,
        region,
      });
      kmsOutputs.push(
        ...logBuckets.map(a => ({
          id: a.encryptionKeyId,
          name: a.encryptionKeyName,
          arn: a.encryptionKeyArn,
        })),
      );
    }

    // If it is master account, checking Central Bucket and Secrets Kms Keys
    if (account.key === masterAccount) {
      const centralBuckets = CentralBucketOutputFinder.findAll({
        outputs,
        accountKey: account.key,
        region,
      });

      kmsOutputs.push(
        ...centralBuckets.map(a => ({
          id: a.encryptionKeyId,
          name: a.encryptionKeyName,
          arn: a.encryptionKeyArn,
        })),
      );

      const secretKeys = SecretEncryptionKeyOutputFinder.findAll({
        outputs,
        accountKey: account.key,
        region,
      });

      kmsOutputs.push(
        ...secretKeys.map(a => ({
          id: a.encryptionKeyId,
          name: a.encryptionKeyName,
          arn: a.encryptionKeyArn,
        })),
      );
    }
  }

  // Finding EBS KMS keys for the account
  const ebsKeys = EbsKmsOutputFinder.findAll({
    outputs,
    accountKey: account.key,
    region,
  });

  kmsOutputs.push(
    ...ebsKeys.map(a => ({
      id: a.encryptionKeyId,
      name: a.encryptionKeyName,
      arn: a.encryptionKeyArn,
    })),
  );

  // Finding SSM KMS keys for the account
  const ssmKeys = SsmKmsOutputFinder.findAll({
    outputs,
    accountKey: account.key,
    region,
  });

  kmsOutputs.push(
    ...ssmKeys.map(a => ({
      id: a.encryptionKeyId,
      name: a.encryptionKeyName,
      arn: a.encryptionKeyArn,
    })),
  );

  for (const kmsOutput of kmsOutputs) {
    console.log('kmsOutput', kmsOutput);
    let currentIndex: number;
    const previousGroupIndexDetails = kms.findIndex(p => p.name === kmsOutput.name);
    if (previousGroupIndexDetails >= 0) {
      currentIndex = kms[previousGroupIndexDetails].index;
      console.log(`skipping creation of kms ${kmsOutput.name} in SSM`);
    } else {
      currentIndex = ++kmsMaxIndex;
      await ssm.putParameter(`/${acceleratorPrefix}/encrypt/kms/${currentIndex}/alias`, `${kmsOutput.name}`);
      await ssm.putParameter(`/${acceleratorPrefix}/encrypt/kms/${currentIndex}/id`, kmsOutput.id);
      await ssm.putParameter(`/${acceleratorPrefix}/encrypt/kms/${currentIndex}/arn`, `${kmsOutput.arn}`);
      kms.push({
        name: kmsOutput.name,
        index: currentIndex,
      });
    }
    updatedKeys.push({
      index: currentIndex,
      name: kmsOutput.name,
    });

    const removalIndex = removalObjects.findIndex(p => p.name === kmsOutput.name);
    if (removalIndex !== -1) {
      removalObjects.splice(removalIndex, 1);
    }
  }

  for (const removeObject of removalObjects || []) {
    const removalKms = [
      `/${acceleratorPrefix}/encrypt/kms/${removeObject.index}/alias`,
      `/${acceleratorPrefix}/encrypt/kms/${removeObject.index}/id`,
      `/${acceleratorPrefix}/encrypt/kms/${removeObject.index}/arn`,
    ].flatMap(s => s);

    while (removalKms.length > 0) {
      await ssm.deleteParameters(removalKms.splice(0, 10));
    }
  }
  return updatedKeys;
}

export async function saveAcm(
  config: AcceleratorConfig,
  outputs: StackOutput[],
  ssm: SSM,
  account: Account,
  region: string,
  acceleratorPrefix: string,
  acm: OutputUtilGenericType[],
): Promise<OutputUtilGenericType[]> {
  const acmIndices = acm.flatMap(r => r.index) || [];
  console.log('acmIndices', acmIndices);
  let acmMaxIndex = acmIndices.length === 0 ? 0 : Math.max(...acmIndices);
  const updatedAcm: OutputUtilGenericType[] = [];
  const removalObjects: OutputUtilGenericType[] = [...(acm || [])];

  const acmOutputs: AcmOutput[] = [];

  // Finding ACM certificates for the account
  const acmCerts = AcmOutputFinder.findAll({
    outputs,
    accountKey: account.key,
    region,
  });

  acmOutputs.push(
    ...acmCerts.map(a => ({
      name: a.certificateName,
      arn: a.certificateArn,
    })),
  );

  for (const acmOutput of acmOutputs) {
    console.log('acmOutput', acmOutput);
    let currentIndex: number;
    const previousGroupIndexDetails = acm.findIndex(p => p.name === acmOutput.name);
    if (previousGroupIndexDetails >= 0) {
      currentIndex = acm[previousGroupIndexDetails].index;
      console.log(`skipping creation of acm ${acmOutput.name} in SSM`);
    } else {
      currentIndex = ++acmMaxIndex;
      await ssm.putParameter(`/${acceleratorPrefix}/encrypt/acm/${currentIndex}/name`, `${acmOutput.name}`);
      await ssm.putParameter(`/${acceleratorPrefix}/encrypt/acm/${currentIndex}/arn`, `${acmOutput.arn}`);
      acm.push({
        name: acmOutput.name,
        index: currentIndex,
      });
    }
    updatedAcm.push({
      index: currentIndex,
      name: acmOutput.name,
    });

    const removalIndex = removalObjects.findIndex(p => p.name === acmOutput.name);
    if (removalIndex !== -1) {
      removalObjects.splice(removalIndex, 1);
    }
  }

  for (const removeObject of removalObjects || []) {
    const removalAcm = [
      `/${acceleratorPrefix}/encrypt/acm/${removeObject.index}/name`,
      `/${acceleratorPrefix}/encrypt/acm/${removeObject.index}/arn`,
    ].flatMap(s => s);

    while (removalAcm.length > 0) {
      await ssm.deleteParameters(removalAcm.splice(0, 10));
    }
  }
  return updatedAcm;
}
