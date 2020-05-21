import { CfnDocument } from '@aws-cdk/aws-ssm';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Key } from '@aws-cdk/aws-kms';
import { AnyPrincipal } from '@aws-cdk/aws-iam';

export interface SSMStep1Props {
  acceleratorPrefix: string;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  bucketName: string;
}

export async function step1(props: SSMStep1Props) {
  const globalOptionsConfig = props.config['global-options'];
  const useS3 = globalOptionsConfig["central-log-services"]["ssm-to-s3"];
  const useCWL = globalOptionsConfig["central-log-services"]["ssm-to-cwl"];

  for (const [accountKey, accountConfig] of props.config.getAccountConfigs()) {
    const accountStack = props.accountStacks.getOrCreateAccountStack(accountKey);

    const ssmKey = new Key(accountStack, `${props.acceleratorPrefix}SSM-Key`, {
      alias: `alias/${props.acceleratorPrefix}SSM-Key`,
      trustAccountIdentities: true
    });
    ssmKey.grantEncryptDecrypt(new AnyPrincipal());

    // Based on doc: https://docs.aws.amazon.com/systems-manager/latest/userguide/getting-started-configure-preferences-cli.html
    const settings = {
      "schemaVersion": "1.0",
      "description": "Document to hold regional settings for Session Manager",
      "sessionType": "Standard_Stream",
      "inputs": {
        "s3BucketName": `${props.bucketName}`,
        "s3EncryptionEnabled": true,
        "cloudWatchLogGroupName": "/PBMMAccel/SSM",
        "cloudWatchEncryptionEnabled": true,
        "kmsKeyId": `${ssmKey.keyId}`,
        "runAsEnabled": false
      }
    };
    new CfnDocument(accountStack, 'SessionManager', {
      name: 'SessionManager Settings',
      content: settings,
      documentType: 'Session',
    });
  }
}