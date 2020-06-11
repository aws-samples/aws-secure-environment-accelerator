import * as cdk from '@aws-cdk/core';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Key } from '@aws-cdk/aws-kms';
import { AccountPrincipal, ServicePrincipal } from '@aws-cdk/aws-iam';
import { LogGroup } from '@custom-resources/logs-log-group';
import { createLogGroupName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface SSMStep1Props {
  acceleratorPrefix: string;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  bucketName: string;
}

export async function step1(props: SSMStep1Props) {
  for (const [accountKey, _] of props.config.getAccountConfigs()) {
    const accountStack = props.accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }

    const ssmKey = new Key(accountStack, `${props.acceleratorPrefix}SSM-Key`, {
      alias: `alias/${props.acceleratorPrefix}SSM-Key`,
      trustAccountIdentities: true,
    });
    ssmKey.grantEncryptDecrypt(new AccountPrincipal(cdk.Aws.ACCOUNT_ID));
    ssmKey.grantEncryptDecrypt(new ServicePrincipal('logs.amazonaws.com'));
    ssmKey.grantEncryptDecrypt(new ServicePrincipal('ssm.amazonaws.com'));

    const logGroup = new LogGroup(accountStack, 'SSMLogGroup', {
      logGroupName: createLogGroupName('SSM'),
    });

    // Save the output so it can be used in the state machine later
    new cdk.CfnOutput(accountStack, outputKeys.OUTPUT_KMS_KEY_ID_FOR_SSM_SESSION_MANAGER, {
      value: ssmKey.keyId,
    });
    new cdk.CfnOutput(accountStack, outputKeys.OUTPUT_CLOUDWATCH_LOG_GROUP_FOR_SSM_SESSION_MANAGER, {
      value: logGroup.logGroupName,
    });

    // Due to CfnDocument is not able to update SSM-SessionManagerRunShell, have to use SDK to update
    // Move this logic to account-default-settings-step.ts
    /*
    new CfnDocument(accountStack, 'SessionManager', {
      name: 'SSM-SessionManagerRunShell',
      content: settings,
      documentType: 'Session',
    });*/
  }
}
