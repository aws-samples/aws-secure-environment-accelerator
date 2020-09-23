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
      predicate: o => o.policyKey === props.policyKey && o.policyName == props.policyName,
    }),
}));
