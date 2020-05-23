import * as cdk from '@aws-cdk/core';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Key } from '@aws-cdk/aws-kms';
import { AccountPrincipal } from '@aws-cdk/aws-iam';
import { LogGroup } from '@aws-cdk/aws-logs';

export interface SSMStep1Props {
  acceleratorPrefix: string;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  bucketName: string;
}

export async function step1(props: SSMStep1Props) {
  const globalOptionsConfig = props.config['global-options'];
  const useS3 = globalOptionsConfig['central-log-services']['ssm-to-s3'];
  const useCWL = globalOptionsConfig['central-log-services']['ssm-to-cwl'];

  for (const [accountKey, accountConfig] of props.config.getAccountConfigs()) {
    const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey);

    const ssmKey = new Key(accountStack, `${props.acceleratorPrefix}SSM-Key`, {
      alias: `alias/${props.acceleratorPrefix}SSM-Key`,
      trustAccountIdentities: true,
    });
    ssmKey.grantEncryptDecrypt(new AccountPrincipal(cdk.Aws.ACCOUNT_ID));

    new LogGroup(accountStack, 'SSM-LogGroup', {
      logGroupName: '/PBMMAccel/SSM',
    });

    // Save the output so it can be used in the state machine later
    new cdk.CfnOutput(accountStack, outputKeys.OUTPUT_KMS_KEY_ID_FOR_SSM_SESSION_MANAGER, {
      value: ssmKey.keyId,
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
