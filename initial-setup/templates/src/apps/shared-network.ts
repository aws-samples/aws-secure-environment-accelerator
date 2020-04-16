import * as cdk from '@aws-cdk/core';
import { OrganizationalUnit } from '../organizational-units/stack';
import { SharedNetwork } from '../shared-network/stack';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { generatePassword } from '../utils/passwords';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();

  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];

  const sharedNetworkAccountId = getAccountId(accounts, 'shared-network');
  const sharedNetworkConfig = mandatoryAccountConfig['shared-network'];

  const app = new cdk.App();

  const stack = new SharedNetwork.Stack(app, 'SharedNetwork', {
    env: {
      account: sharedNetworkAccountId,
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-SharedNetwork',
    accountConfig: sharedNetworkConfig,
  });

  // This is an example of a generated password
  // You can use the password as follows: `madRootPassword.toString()`
  const madRootPassword = await generatePassword({
    cdkStack: stack,
    cdkId: 'MadPassword',
    passwordsKmsKeyArn: context.passwordsKmsKeyArn,
    secretName: 'accelerator/passwords/mad/root',
    roleArns: [`arn:aws:iam::${stack.account}:role/${context.acceleratorExecutionRoleName}`],
  });

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
