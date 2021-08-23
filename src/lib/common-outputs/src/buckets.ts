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
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

const AccountBucketOutput = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
    region: t.string,
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
  },
  'AccountBucket',
);

type AccountBucketOutput = t.TypeOf<typeof AccountBucketOutput>;

const LogBucketOutput = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
    region: t.string,
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
  },
  'LogBucket',
);

type LogBucketOutput = t.TypeOf<typeof LogBucketOutput>;

const CentralBucketOutput = t.interface(
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

type CentralBucketOutput = t.TypeOf<typeof CentralBucketOutput>;

export const AccountBucketOutputFinder = createStructuredOutputFinder(AccountBucketOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));

export const LogBucketOutputTypeOutputFinder = createStructuredOutputFinder(LogBucketOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));

export const CentralBucketOutputFinder = createStructuredOutputFinder(CentralBucketOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));
