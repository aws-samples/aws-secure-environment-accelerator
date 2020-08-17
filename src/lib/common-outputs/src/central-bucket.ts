import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

export const CentralBucketOutput = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
  },
  'CentralBucket',
);

export type CentralBucketOutput = t.TypeOf<typeof CentralBucketOutput>;

export const CentralBucketOutputFinder = createStructuredOutputFinder(CentralBucketOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string }) =>
    finder.findOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
    }),
}));
