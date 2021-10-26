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

export const IamRoleOutput = t.interface(
  {
    roleName: t.string,
    roleArn: t.string,
    roleKey: t.string,
  },
  'IamRole',
);

export type IamRoleOutput = t.TypeOf<typeof IamRoleOutput>;

export const IamRoleOutputFinder = createStructuredOutputFinder(IamRoleOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey: string; roleKey?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      predicate: o => o.roleKey === props.roleKey,
    }),
}));

export const IamRoleNameOutputFinder = createStructuredOutputFinder(IamRoleOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey: string; roleName: string; roleKey?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      predicate: o => o.roleKey === props.roleKey && o.roleName === props.roleName,
    }),
}));

export const IamPolicyOutput = t.interface(
  {
    policyName: t.string,
    policyArn: t.string,
    policyKey: t.string,
  },
  'IamPolicy',
);

export type IamPolicyOutput = t.TypeOf<typeof IamPolicyOutput>;

export const IamPolicyOutputFinder = createStructuredOutputFinder(IamPolicyOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey: string; policyKey?: string; policyName?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      predicate: o => o.policyKey === props.policyKey && o.policyName === props.policyName,
    }),
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string; policyKey?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
      predicate: o => o.policyKey === props.policyKey,
    }),
}));
