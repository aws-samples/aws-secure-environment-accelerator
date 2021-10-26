import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export const SnsTopicOutput = t.interface(
  {
    topicName: t.string,
    topicArn: t.string,
    topicKey: t.string,
  },
  'SnsTopic',
);

export type SnsTopicOutput = t.TypeOf<typeof SnsTopicOutput>;

export const SnsTopicOutputFinder = createStructuredOutputFinder(SnsTopicOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string; topicKey?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
      predicate: o => o.topicKey === props.topicKey,
    }),
}));
