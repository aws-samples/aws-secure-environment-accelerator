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
