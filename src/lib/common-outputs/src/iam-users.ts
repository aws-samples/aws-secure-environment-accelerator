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
