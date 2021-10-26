import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export const EbsKmsOutput = t.interface(
  {
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
    encryptionKeyArn: t.string,
  },
  'EbsKms',
);

export type EbsKmsOutput = t.TypeOf<typeof EbsKmsOutput>;

export const EbsKmsOutputFinder = createStructuredOutputFinder(EbsKmsOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));
