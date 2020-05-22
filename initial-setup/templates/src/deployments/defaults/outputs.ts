import * as s3 from '@aws-cdk/aws-s3';
import { createFixedBucketName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';

export type AccountBuckets = { [accountKey: string]: s3.IBucket };

export interface DefaultBucketNameProps {
  acceleratorPrefix: string;
  accountKey: string;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
}

export function createDefaultBucketName(props: DefaultBucketNameProps): string {
  const defaultRegion = props.config['global-options']['aws-org-master'].region;
  const accountStack = props.accountStacks.getOrCreateAccountStack(props.accountKey);

  return createFixedBucketName({
    ...props,
    acceleratorPrefix: props.acceleratorPrefix,
    accountId: accountStack.accountId,
    region: defaultRegion,
    seed: 'Default',
  });
}

export interface CentralBucketNameProps {
  acceleratorPrefix: string;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
}

export function createCentralBucketName(props: CentralBucketNameProps): string {
  const masterAccountConfig = props.config['global-options']['aws-org-master'];
  const masterAccountKey = masterAccountConfig.account;
  const masterAccountRegion = masterAccountConfig.region;
  const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey);

  return createFixedBucketName({
    acceleratorPrefix: props.acceleratorPrefix,
    accountId: masterAccountStack.accountId,
    region: masterAccountRegion,
    name: 'central',
  });
}

export namespace AccountBucketOutput {
  export function getAccountBuckets(props: Omit<DefaultBucketNameProps, 'accountKey'>): AccountBuckets {
    const accountBuckets: AccountBuckets = {};
    for (const accountStack of Object.values(props.accountStacks)) {
      const defaultBucketName = createDefaultBucketName({
        ...props,
        accountKey: accountStack.accountKey,
      });
      const defaultBucket = s3.Bucket.fromBucketAttributes(accountStack, 'CentralBucket', {
        bucketName: defaultBucketName,
      });
      accountBuckets[accountStack.accountKey] = defaultBucket;
    }
    return accountBuckets;
  }
}

export namespace CentralBucketOutput {
  export function getBucket(props: CentralBucketNameProps) {
    const masterAccountConfig = props.config['global-options']['aws-org-master'];
    const masterAccountKey = masterAccountConfig.account;
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey);

    const centralBucketName = createCentralBucketName(props);
    return s3.Bucket.fromBucketAttributes(masterAccountStack, 'CentralBucket', {
      bucketName: centralBucketName,
    });
  }
}
