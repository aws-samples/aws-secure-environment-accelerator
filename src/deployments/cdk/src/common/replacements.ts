import * as c from '@aws-accelerator/common-config';
import * as cdk from '@aws-cdk/core';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { LogBucketOutput, AccountBucketOutputFinder } from '../deployments/defaults/outputs';
import { IamPolicyOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';

/**
 * Dynamic Replacements
 * @param rawConfigStr
 * @returns
 */
export function getDynamicReplaceableValue(props: {
  paramKey: string;
  outputs: StackOutput[];
  config: c.AcceleratorConfig;
  accountKey: string;
  defaultRegion: string;
}): string {
  const { accountKey, config, outputs, paramKey, defaultRegion } = props;
  switch (paramKey) {
    case 'LogArchiveAesBucket': {
      return LogBucketOutput.getBucketDetails({
        config,
        outputs,
      }).name;
    }
    case 'S3BucketEncryptionKey': {
      const accountBucket = AccountBucketOutputFinder.tryFindOne({
        outputs,
        accountKey,
        region: defaultRegion,
      });
      return `arn:${cdk.Aws.PARTITION}:kms:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:alias/${accountBucket?.encryptionKeyName}`;
    }
    case 'EC2InstaceProfilePermissions': {
      const ssmPolicyOutput = IamPolicyOutputFinder.findOneByName({
        outputs,
        accountKey,
        policyKey: 'IamSsmWriteAccessPolicy',
      });
      if (!ssmPolicyOutput) {
        console.warn(`Didn't find IAM SSM Log Archive Write Access Policy in output`);
        return '';
      }
      return ssmPolicyOutput.policyArn;
    }
    case 'AccountBucketName': {
      const accountBucket = AccountBucketOutputFinder.tryFindOne({
        outputs,
        accountKey,
        region: defaultRegion,
      });
      // eslint-disable-next-line no-template-curly-in-string
      return accountBucket?.bucketArn || '${SEA::AccountBucket}';
    }
    default: {
      // eslint-disable-next-line no-template-curly-in-string
      return `\${SEA:CUSTOM::${paramKey}\}`;
    }
  }
}
