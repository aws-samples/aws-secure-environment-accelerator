import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { Operations } from '../operations/stack';
import { SecretsStack } from '../../../../common-cdk/lib/core/secrets-stack';
import { loadContext } from '../utils/context';
import * as iam from '@aws-cdk/aws-iam';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();

  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];

  // TODO get the subnet ids from respective account
  // const subnetInfo = getStackOutput(outputs, 'shared-network', 'SubnetInfo');
  const subnetInfo = {
    vpcId: 'vpc-0006f352d764d0c78',
    subnetIds: ['subnet-00d10366607bf20b1', 'subnet-0e412cda1d44e8537'],
  };

  const app = new cdk.App();

  for (const [orgKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
    const madDeploymentConfig = accountConfig.deployments.mad!;
    if (madDeploymentConfig && madDeploymentConfig.deploy) {
      const accountId = getAccountId(accounts, accountConfig['account-name']);

      const secretsStack = new SecretsStack(app, 'SharedNetworkSecrets', {
        env: {
          account: getAccountId(accounts, 'master'),
          region: cdk.Aws.REGION,
        },
        acceleratorName: context.acceleratorName,
        acceleratorPrefix: context.acceleratorPrefix,
        stackName: `PBMMAccel-${accountConfig['account-name']}Secrets`,
      });

      const madPassword = secretsStack.createSecret('MadPassword', {
        secretName: `accelerator/${accountConfig['account-name']}/mad/password`,
        description: 'Password for Managed Active Directory.',
        generateSecretString: {
          passwordLength: 16,
        },
        principals: [new iam.ArnPrincipal(`arn:aws:iam::${accountId}:role/${context.acceleratorExecutionRoleName}`)],
      });

      new Operations.Stack(app, 'Operations', {
        env: {
          account: accountId,
          region: cdk.Aws.REGION,
        },
        stackName: `PBMMAccel-${accountConfig['account-name']}`,
        madDeploymentConfig,
        subnetInfo,
        password: madPassword,
      });
    }
  }
}

// tslint:disable-next-line: no-floating-promises
main();
