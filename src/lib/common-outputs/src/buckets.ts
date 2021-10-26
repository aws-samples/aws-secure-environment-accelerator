import * as t from 'io-ts';
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';

const AccountBucketOutput = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
    region: t.string,
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
  },
  'AccountBucket',
);

type AccountBucketOutput = t.TypeOf<typeof AccountBucketOutput>;

const LogBucketOutput = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
    region: t.string,
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
  },
  'LogBucket',
);

type LogBucketOutput = t.TypeOf<typeof LogBucketOutput>;

const CentralBucketOutput = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
    region: t.string,
    encryptionKeyName: t.string,
    encryptionKeyId: t.string,
  },
  'CentralBucket',
);

type CentralBucketOutput = t.TypeOf<typeof CentralBucketOutput>;

export const AccountBucketOutputFinder = createStructuredOutputFinder(AccountBucketOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));

export const LogBucketOutputTypeOutputFinder = createStructuredOutputFinder(LogBucketOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));

export const CentralBucketOutputFinder = createStructuredOutputFinder(CentralBucketOutput, finder => ({
  findOneByName: (props: { outputs: StackOutput[]; accountKey: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
    }),
}));
