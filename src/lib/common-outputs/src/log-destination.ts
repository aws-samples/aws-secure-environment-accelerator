import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export const LogDestinationOutput = t.interface(
  {
    destinationName: t.string,
    destinationArn: t.string,
    destinationKey: t.string,
  },
  'LogDestination',
);

export type LogDestinationOutput = t.TypeOf<typeof LogDestinationOutput>;

export const LogDestinationOutputFinder = createStructuredOutputFinder(LogDestinationOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string; destinationKey?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
      predicate: o => o.destinationKey === props.destinationKey,
    }),
}));
