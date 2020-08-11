import * as cdk from '@aws-cdk/core';
import { StackOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Key } from '@aws-cdk/aws-kms';
import { AccountPrincipal, ServicePrincipal } from '@aws-cdk/aws-iam';
import { LogGroup } from '@custom-resources/logs-log-group';
import { createLogGroupName, createEncryptionKeyName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';
import { getVpcSharedAccountKeys } from '../../common/vpc-subnet-sharing';
import { Account } from '../../utils/accounts';
import { IamRoleOutputFinder } from '@aws-pbmm/common-outputs/lib/iam-role';
import { SSMDocument } from '@custom-resources/ssm-create-document';
import { AccountBuckets } from '../defaults';

export interface SSMStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  bucketName: string;
  accounts: Account[];
  outputs: StackOutput[];
  accountBuckets: AccountBuckets;
}

export type AccountRegionSSMKeys = { [accountKey: string]: { [region: string]: Key } | undefined };

export async function step1(props: SSMStep1Props) {
  const { accountStacks, accounts, config, outputs, accountBuckets } = props;
  const logArchiveAccountKey = config['global-options']['central-log-services'].account;
  const logBucket = accountBuckets[logArchiveAccountKey];
  const accountRegionSsmDocuments: AccountRegionSSMKeys = {};
  for (const { accountKey, vpcConfig, ouKey } of config.getVpcConfigs()) {
    const region = vpcConfig.region;
    const vpcSharedTo = getVpcSharedAccountKeys(accounts, vpcConfig, ouKey);
    vpcSharedTo.push(accountKey);
    const accountKeys = Array.from(new Set(vpcSharedTo));
    for (const localAccountKey of accountKeys) {
      if (accountRegionSsmDocuments[localAccountKey]?.[region]) {
        console.log(`SSMDocument is already created in account ${localAccountKey} and region ${region}`);
        continue;
      }
      const accountStack = accountStacks.tryGetOrCreateAccountStack(localAccountKey, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${localAccountKey}`);
        continue;
      }

      const ssmKey = new Key(accountStack, 'SSM-Key', {
        alias: 'alias/' + createEncryptionKeyName('SSM-Key'),
        trustAccountIdentities: true,
      });
      ssmKey.grantEncryptDecrypt(new AccountPrincipal(cdk.Aws.ACCOUNT_ID));
      ssmKey.grantEncryptDecrypt(new ServicePrincipal('logs.amazonaws.com'));

      const logGroup = new LogGroup(accountStack, 'SSMLogGroup', {
        logGroupName: createLogGroupName('SSM'),
      });
      const globalOptionsConfig = config['global-options'];
      const useS3 = globalOptionsConfig['central-log-services']['ssm-to-s3'];
      const useCWL = globalOptionsConfig['central-log-services']['ssm-to-cwl'];

      const ssmDocumentRole = IamRoleOutputFinder.tryFindOneByName({
        outputs,
        accountKey: localAccountKey,
        roleKey: 'SSMDocumentRole',
      });

      if (!ssmDocumentRole) {
        console.error(`${localAccountKey}:: No Role created for SSMCreateDocument`);
        continue;
      }
      const ssmDocument = new SSMDocument(accountStack, 'CreateSSMDocument', {
        roleArn: ssmDocumentRole.roleArn,
        s3BucketName: logBucket.bucketName,
        cloudWatchEncryptionEnabled: useCWL,
        cloudWatchLogGroupName: logGroup.logGroupName,
        documentName: `SSM-SessionManagerRunShell`,
        kmsKeyId: ssmKey.keyArn,
        s3EncryptionEnabled: useS3,
        s3KeyPrefix: `/${accountStack.accountId}/${accountStack.region}/SSM/`,
        documentType: 'Session',
      });
      ssmDocument.node.addDependency(logGroup);
      ssmDocument.node.addDependency(ssmKey);
      accountRegionSsmDocuments[localAccountKey] = {
        ...accountRegionSsmDocuments[localAccountKey],
        [region]: ssmKey,
      };
    }
  }
}
