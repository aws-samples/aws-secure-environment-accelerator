import * as t from 'io-ts';
import { createFixedBucketName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export function createDefaultBucketName(props: { acceleratorPrefix: string; account: string; region: string }): string {
  return createFixedBucketName({
    ...props,
    seed: 'Default',
  });
}

export const AccountBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    region: t.string,
  },
  'AccountBucket',
);

export type AccountBucketOutput = t.TypeOf<typeof AccountBucketOutputType>;

export const CentralBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    region: t.string,
  },
  'CentralBucket',
);

export type CentralBucketOutput = t.TypeOf<typeof CentralBucketOutputType>;
