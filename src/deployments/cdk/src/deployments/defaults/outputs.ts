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

import * as t from 'io-ts';
import * as cdk from '@aws-cdk/core';
import * as kms from '@aws-cdk/aws-kms';
import * as s3 from '@aws-cdk/aws-s3';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { Account } from '../../utils/accounts';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { StructuredOutput, createCfnStructuredOutput } from '../../common/structured-output';
import { EbsKmsOutput } from '@aws-accelerator/common-outputs/src/ebs';
import { SsmKmsOutput } from '@aws-accelerator/common-outputs/src/ssm';
import { optional } from '@aws-accelerator/common-types';
import { createStructuredOutputFinder } from '@aws-accelerator/common-outputs/src/structured-output';
import { DefaultKmsOutput } from '@aws-accelerator/common-outputs/src/kms';

export const CfnEbsKmsOutput = createCfnStructuredOutput(EbsKmsOutput);
export const CfnDefaultKmsOutput = createCfnStructuredOutput(DefaultKmsOutput);

export const CfnSsmKmsOutput = createCfnStructuredOutput(SsmKmsOutput);

export interface RegionalBucket extends s3.IBucket {
  region: string;
}

export interface RegionalBucketAttributes extends s3.BucketAttributes {
  region: string;
}

export namespace RegionalBucket {
  export function fromBucketAttributes(
    scope: cdk.Construct,
    id: string,
    attrs: RegionalBucketAttributes,
  ): RegionalBucket {
    return Object.assign(s3.Bucket.fromBucketAttributes(scope, id, attrs), {
      region: attrs.region,
    });
  }
}

export type AccountBuckets = { [accountKey: string]: s3.IBucket };

// TODO Merge all these outputs into one
const AccountBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
    region: optional(t.string),
    encryptionKeyName: optional(t.string),
    encryptionKeyId: optional(t.string),
  },
  'AccountBucket',
);

type AccountBucketOutput = t.TypeOf<typeof AccountBucketOutputType>;

const LogBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
    region: t.string,
    encryptionKeyName: optional(t.string),
    encryptionKeyId: optional(t.string),
  },
  'LogBucket',
);

type LogBucketOutput = t.TypeOf<typeof LogBucketOutputType>;

const CentralBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
    region: t.string,
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
  },
  'CentralBucket',
);

type CentralBucketOutput = t.TypeOf<typeof CentralBucketOutputType>;

const AesBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    region: t.string,
  },
  'AesBucket',
);

type AesBucketOutput = t.TypeOf<typeof AesBucketOutputType>;

export const CfnAccountBucketOutput = createCfnStructuredOutput(AccountBucketOutputType);
export const CfnLogBucketOutput = createCfnStructuredOutput(LogBucketOutputType);
export const CfnCentralBucketOutput = createCfnStructuredOutput(CentralBucketOutputType);
export const CfnAesBucketOutput = createCfnStructuredOutput(AesBucketOutputType);

export const AccountBucketOutputFinder = createStructuredOutputFinder(AccountBucketOutputType, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey?: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));

export namespace AccountBucketOutput {
  /**
   * Helper method to import the account buckets from different phases. It includes the log bucket.
   */
  export function getAccountBuckets(props: {
    accounts: Account[];
    accountStacks: AccountStacks;
    config: AcceleratorConfig;
    outputs: StackOutput[];
  }): { [accountKey: string]: RegionalBucket } {
    const accountBuckets: { [accountKey: string]: RegionalBucket } = {};

    const logBucket = LogBucketOutput.getBucket(props);
    accountBuckets[props.config['global-options']['central-log-services'].account] = logBucket;

    for (const account of props.accounts) {
      const accountStack = props.accountStacks.tryGetOrCreateAccountStack(account.key);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${account.key}`);
        continue;
      }

      const accountBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
        accountKey: account.key,
        type: AccountBucketOutputType,
      });
      const accountBucketOutput = accountBucketOutputs?.[0];
      if (!accountBucketOutput) {
        continue;
      }

      const encryptionKey = kms.Key.fromKeyArn(accountStack, 'DefaultKey', accountBucketOutput.encryptionKeyArn);
      const defaultBucket = RegionalBucket.fromBucketAttributes(accountStack, 'DefaultBucket', {
        bucketName: accountBucketOutput.bucketName,
        encryptionKey,
        region: accountBucketOutput.region!,
      });
      accountBuckets[account.key] = defaultBucket;
    }
    return accountBuckets;
  }
}

export namespace LogBucketOutput {
  /**
   * Helper method to import the log bucket from different phases.
   */
  export function getBucket(props: {
    accountStacks: AccountStacks;
    config: AcceleratorConfig;
    outputs: StackOutput[];
  }): RegionalBucket {
    const logAccountConfig = props.config['global-options']['central-log-services'];
    const logAccountKey = logAccountConfig.account;
    const logAccountStack = props.accountStacks.getOrCreateAccountStack(logAccountKey);

    const logBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
      accountKey: logAccountKey,
      type: LogBucketOutputType,
    });
    const logBucketOutput = logBucketOutputs?.[0];
    if (!logBucketOutput) {
      throw new Error(`Cannot find central log bucket for log account ${logAccountKey}`);
    }

    const encryptionKey = kms.Key.fromKeyArn(logAccountStack, 'LogBucketKey', logBucketOutput.encryptionKeyArn);
    return RegionalBucket.fromBucketAttributes(logAccountStack, 'LogBucket', {
      bucketName: logBucketOutput.bucketName,
      encryptionKey,
      region: logBucketOutput.region,
    });
  }

  export function getBucketDetails(props: {
    config: AcceleratorConfig;
    outputs: StackOutput[];
  }): {
    arn: string;
    name: string;
  } {
    const logAccountConfig = props.config['global-options']['central-log-services'];
    const logAccountKey = logAccountConfig.account;

    const logBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
      accountKey: logAccountKey,
      type: AesBucketOutputType,
    });
    const logBucketOutput = logBucketOutputs?.[0];
    if (!logBucketOutput) {
      throw new Error(`Cannot find central log bucket for log account ${logAccountKey}`);
    }
    return {
      arn: logBucketOutput.bucketArn,
      name: logBucketOutput.bucketName,
    };
  }
}

export namespace AesBucketOutput {
  /**
   * Helper method to import the log bucket from different phases.
   */
  export function getBucket(props: {
    accountStacks: AccountStacks;
    config: AcceleratorConfig;
    outputs: StackOutput[];
  }): RegionalBucket {
    const logAccountConfig = props.config['global-options']['central-log-services'];
    const logAccountKey = logAccountConfig.account;
    const logAccountStack = props.accountStacks.getOrCreateAccountStack(logAccountKey);

    const aesBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
      accountKey: logAccountKey,
      type: AesBucketOutputType,
    });
    const aesBucketOutput = aesBucketOutputs?.[0];
    if (!aesBucketOutput) {
      throw new Error(`Cannot find central AES bucket for log account ${logAccountKey}`);
    }

    return RegionalBucket.fromBucketAttributes(logAccountStack, 'AesLogBucket', {
      bucketName: aesBucketOutput.bucketName,
      region: aesBucketOutput.region,
    });
  }
}

export namespace CentralBucketOutput {
  /**
   * Helper method to import the central bucket from different phases.
   */
  export function getBucket(props: {
    accountStacks: AccountStacks;
    config: AcceleratorConfig;
    outputs: StackOutput[];
  }): RegionalBucket {
    const masterAccountConfig = props.config['global-options']['aws-org-management'];
    const masterAccountKey = masterAccountConfig.account;
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey);

    const centralBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
      accountKey: masterAccountKey,
      type: CentralBucketOutputType,
    });
    const centralBucketOutput = centralBucketOutputs?.[0];
    if (!centralBucketOutput) {
      throw new Error(`Cannot find central bucket for primary account ${masterAccountKey}`);
    }

    const encryptionKey = kms.Key.fromKeyArn(
      masterAccountStack,
      'CentralBucketKey',
      centralBucketOutput.encryptionKeyArn,
    );
    return RegionalBucket.fromBucketAttributes(masterAccountStack, 'CentralBucket', {
      bucketName: centralBucketOutput.bucketName,
      encryptionKey,
      region: centralBucketOutput.region,
    });
  }
}
