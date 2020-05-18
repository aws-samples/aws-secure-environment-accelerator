import * as t from 'io-ts';

export const AccountBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    region: t.string,
  },
  'AccountBucket',
);

export type AccountBucketOutput = t.TypeOf<typeof AccountBucketOutputType>;
