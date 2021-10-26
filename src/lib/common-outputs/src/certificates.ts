import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export const AcmOutput = t.interface(
  {
    certificateName: t.string,
    certificateArn: t.string,
  },
  'Acm',
);

export type AcmOutput = t.TypeOf<typeof AcmOutput>;

export const AcmOutputFinder = createStructuredOutputFinder(AcmOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));
