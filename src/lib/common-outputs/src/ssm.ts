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

export const SSMOutput = t.interface(
  {
    roleName: t.string,
    roleArn: t.string,
    roleKey: t.string,
  },
  'IamRole',
);

export type IamRoleOutput = t.TypeOf<typeof SSMOutput>;

export const IamRoleOutputFinder = createStructuredOutputFinder(SSMOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey: string; roleKey?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      predicate: o => o.roleKey === props.roleKey,
    }),
}));

export const SsmKmsOutput = t.interface(
  {
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
    encryptionKeyArn: t.string,
  },
  'SsmKms',
);

export type SsmKmsOutput = t.TypeOf<typeof SsmKmsOutput>;

export const SsmKmsOutputFinder = createStructuredOutputFinder(SsmKmsOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));
