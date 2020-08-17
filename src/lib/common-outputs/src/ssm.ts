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
