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

export const IamUserOutput = t.interface(
  {
    userName: t.string,
    userArn: t.string,
    userKey: t.string,
  },
  'IamUser',
);

export type IamUserOutput = t.TypeOf<typeof IamUserOutput>;

export const IamUserOutputFinder = createStructuredOutputFinder(IamUserOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey: string; userKey?: string; userName?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      predicate: o => o.userKey === props.userKey && o.userName === props.userName,
    }),
}));

export const IamGroupOutput = t.interface(
  {
    groupName: t.string,
    groupArn: t.string,
    groupKey: t.string,
  },
  'IamGroup',
);

export type IamGroupOutput = t.TypeOf<typeof IamGroupOutput>;

export const IamGroupOutputFinder = createStructuredOutputFinder(IamGroupOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey: string; groupKey?: string; groupName?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      predicate: o => o.groupKey === props.groupKey && o.groupName === props.groupName,
    }),
}));
