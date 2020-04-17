import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import { OrganizationalUnit } from '../organizational-units/stack';
import { SharedNetwork } from '../shared-network/stack';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { SecretsStack } from '@aws-pbmm/common-cdk/lib/core/secrets-stack';
import { getStackOutput, loadStackOutputs } from '../utils/outputs';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const outputs = await loadStackOutputs();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();

  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];
  const logArchiveAccountId = getAccountId(accounts, 'log-archive');
  const logArchiveS3BucketArn = getStackOutput(outputs, 'log-archive', 's3BucketArn');
  const logArchiveS3KmsKeyArn = getStackOutput(outputs, 'log-archive', 's3KmsKeyArn');

  const masterAccountId = getAccountId(accounts, 'master');

  const sharedNetworkAccountId = getAccountId(accounts, 'shared-network');
  const sharedNetworkConfig = mandatoryAccountConfig['shared-network'];

  const app = new cdk.App();

  const secretsStack = new SecretsStack(app, 'SharedNetworkSecrets', {
    env: {
      account: masterAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-SharedNetworkSecrets',
  });

  // Create secret for MAD
  // The secret can be used in a stack as follows
  //   `madPassword.secretValue.toString()`
  const madPassword = secretsStack.createSecret('MadPassword', {
    secretName: 'accelerator/shared-network/mad/password',
    description: 'Password for Managed Active Directory.',
    generateSecretString: {
      passwordLength: 16,
    },
    principals: [
      new iam.ArnPrincipal(`arn:aws:iam::${sharedNetworkAccountId}:role/${context.acceleratorExecutionRoleName}`),
    ],
  });

  const mainStack = new SharedNetwork.Stack(app, 'SharedNetwork', {
    env: {
      account: sharedNetworkAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-SharedNetwork',
    accountConfig: sharedNetworkConfig,
    acceleratorExecutionRoleName: context.acceleratorExecutionRoleName,
    logArchiveAccountId,
    logArchiveS3BucketArn,
    logArchiveS3KmsKeyArn,
  });
  mainStack.addDependency(secretsStack);

  const organizationalUnits = acceleratorConfig['organizational-units'];
  new OrganizationalUnit.Stack(app, 'OrganizationalUnits', {
    env: {
      account: sharedNetworkAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-OrganizationalUnits',
    organizationalUnits,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
