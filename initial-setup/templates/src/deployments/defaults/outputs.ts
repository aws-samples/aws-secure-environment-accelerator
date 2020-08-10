import * as t from 'io-ts';
import * as kms from '@aws-cdk/aws-kms';
import * as s3 from '@aws-cdk/aws-s3';
import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Account } from '../../utils/accounts';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { StructuredOutput } from '../../common/structured-output';

export type AccountBuckets = { [accountKey: string]: s3.IBucket };

// TODO Merge all these outputs into one
export const AccountBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
  },
  'AccountBucket',
);

export type AccountBucketOutput = t.TypeOf<typeof AccountBucketOutputType>;

export const LogBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
  },
  'LogBucket',
);

export type LogBucketOutput = t.TypeOf<typeof LogBucketOutputType>;

export const CentralBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
    encryptionKeyArn: t.string,
  },
  'CentralBucket',
);

export type CentralBucketOutput = t.TypeOf<typeof CentralBucketOutputType>;

export const AesBucketOutputType = t.interface(
  {
    bucketName: t.string,
    bucketArn: t.string,
  },
  'AesBucket',
);

export type AesBucketOutput = t.TypeOf<typeof AesBucketOutputType>;

export namespace AccountBucketOutput {
  /**
   * Helper method to import the account buckets from different phases. It includes the log bucket.
   */
  export function getAccountBuckets(props: {
    accounts: Account[];
    accountStacks: AccountStacks;
    config: AcceleratorConfig;
    outputs: StackOutput[];
  }): AccountBuckets {
    const accountBuckets: AccountBuckets = {};

    const logBucket = LogBucketOutput.getBucket(props);
    accountBuckets[props.config['global-options']['central-log-services'].account] = logBucket;

    for (const account of props.accounts) {
      const accountStack = props.accountStacks.tryGetOrCreateAccountStack(account.key);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${account.key}`);
        continue;
      }

      const accountBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
        accountKey: account.key,
        type: AccountBucketOutputType,
      });
      const accountBucketOutput = accountBucketOutputs?.[0];
      if (!accountBucketOutput) {
        continue;
      }

      const encryptionKey = kms.Key.fromKeyArn(accountStack, 'DefaultKey', accountBucketOutput.encryptionKeyArn);
      const defaultBucket = s3.Bucket.fromBucketAttributes(accountStack, 'DefaultBucket', {
        bucketName: accountBucketOutput.bucketName,
        encryptionKey,
      });
      accountBuckets[account.key] = defaultBucket;
    }
    return accountBuckets;
  }
}

export namespace LogBucketOutput {
  /**
   * Helper method to import the log bucket from different phases.
   */
  export function getBucket(props: {
    accountStacks: AccountStacks;
    config: AcceleratorConfig;
    outputs: StackOutput[];
  }) {
    const logAccountConfig = props.config['global-options']['central-log-services'];
    const logAccountKey = logAccountConfig.account;
    const logAccountStack = props.accountStacks.getOrCreateAccountStack(logAccountKey);

    const logBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
      accountKey: logAccountKey,
      type: LogBucketOutputType,
    });
    const logBucketOutput = logBucketOutputs?.[0];
    if (!logBucketOutput) {
      throw new Error(`Cannot find central log bucket for log account ${logAccountKey}`);
    }

    const encryptionKey = kms.Key.fromKeyArn(logAccountStack, 'LogBucketKey', logBucketOutput.encryptionKeyArn);
    return s3.Bucket.fromBucketAttributes(logAccountStack, 'LogBucket', {
      bucketName: logBucketOutput.bucketName,
      encryptionKey,
    });
  }
}

export namespace AesBucketOutput {
  /**
   * Helper method to import the log bucket from different phases.
   */
  export function getBucket(props: {
    accountStacks: AccountStacks;
    config: AcceleratorConfig;
    outputs: StackOutput[];
  }) {
    const logAccountConfig = props.config['global-options']['central-log-services'];
    const logAccountKey = logAccountConfig.account;
    const logAccountStack = props.accountStacks.getOrCreateAccountStack(logAccountKey);

    const aesBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
      accountKey: logAccountKey,
      type: AesBucketOutputType,
    });
    const aesBucketOutput = aesBucketOutputs?.[0];
    if (!aesBucketOutput) {
      throw new Error(`Cannot find central AES bucket for log account ${logAccountKey}`);
    }

    return s3.Bucket.fromBucketAttributes(logAccountStack, 'AesLogBucket', {
      bucketName: aesBucketOutput.bucketName,
    });
  }
}

export namespace CentralBucketOutput {
  /**
   * Helper method to import the central bucket from different phases.
   */
  export function getBucket(props: {
    accountStacks: AccountStacks;
    config: AcceleratorConfig;
    outputs: StackOutput[];
  }) {
    const masterAccountConfig = props.config['global-options']['aws-org-master'];
    const masterAccountKey = masterAccountConfig.account;
    const masterAccountStack = props.accountStacks.getOrCreateAccountStack(masterAccountKey);

    const centralBucketOutputs = StructuredOutput.fromOutputs(props.outputs, {
      accountKey: masterAccountKey,
      type: CentralBucketOutputType,
    });
    const centralBucketOutput = centralBucketOutputs?.[0];
    if (!centralBucketOutput) {
      throw new Error(`Cannot find central bucket for primary account ${masterAccountKey}`);
    }

    const encryptionKey = kms.Key.fromKeyArn(
      masterAccountStack,
      'CentralBucketKey',
      centralBucketOutput.encryptionKeyArn,
    );
    return s3.Bucket.fromBucketAttributes(masterAccountStack, 'CentralBucket', {
      bucketName: centralBucketOutput.bucketName,
      encryptionKey,
    });
  }
}
