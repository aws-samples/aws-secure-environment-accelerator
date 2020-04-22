import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import * as iam from '@aws-cdk/aws-iam';
import { SecretsStack } from '../../../../common-cdk/lib/core/secrets-stack';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { ActiveDirectory } from '../common/active-directory';
import { getStackOutput, loadStackOutputs } from '../utils/outputs';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  // TODO get the subnet ids from respective account
  // const subnetInfo = getStackOutput(outputs, 'shared-network', 'SubnetInfo');

  const subnetInfo = {
    vpcId: 'vpc-0aeafdbddfbfbfe26',
    subnetIds: ['subnet-0be46191e5bbd060e', 'subnet-0016cdca90a93151c'],
  };

  const app = new cdk.App();
  const secretsStack = new SecretsStack(app, 'Secrets', {
    env: {
      account: getAccountId(accounts, 'master'),
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-Secrets',
  });

  const organizationUnits = acceleratorConfig['organizational-units'];
  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];

  for (const accountConfig of Object.values(mandatoryAccountConfig)) {
    const madDeploymentConfig = accountConfig.deployments!.mad;
    if (madDeploymentConfig && madDeploymentConfig.deploy) {
      
      let vpcIdKey: string;
      const subnetKeys: string[] = [];
      let deployedAccountName: string;

      for (const orgUnit of Object.values(organizationUnits)) {
        if (orgUnit.vpc?.name === madDeploymentConfig['vpc-name']) {
          deployedAccountName = orgUnit.vpc.deploy!;
          for (const subnet of orgUnit.vpc.subnets!) {
            if (subnet.name === madDeploymentConfig.subnet) {
              vpcIdKey = ''; // TODO get the VPC Key Id
              for (const [key, definition] of Object.entries(subnet.definitions)) {
                if (!definition.disabled) {
                  subnetKeys.push(definition.az);
                } // TODO get the subnet ids
                // break; // TODO
              }
            }
          }
        }
      }

      const accountId = getAccountId(accounts, accountConfig['account-name']);
      const madPassword = secretsStack.createSecret('MadPassword', {
        secretName: `accelerator/${accountConfig['account-name']}/mad/password`,
        description: 'Password for Managed Active Directory.',
        generateSecretString: {
          passwordLength: 16,
        },
        principals: [new iam.AccountPrincipal(accountId)],
      });

      const stack = new AcceleratorStack(app, `${accountConfig['account-name']}`, {
        env: {
          account: accountId,
          region: cdk.Aws.REGION,
        },
        acceleratorName: context.acceleratorName,
        acceleratorPrefix: context.acceleratorPrefix,
        stackName: `PBMMAccel-${accountConfig['account-name']}`,
      });

      const activeDirectory = new ActiveDirectory(stack, 'Microsoft AD', {
        madDeploymentConfig,
        subnetInfo,
        password: madPassword,
      });

      new cdk.CfnOutput(stack, `${activeDirectory.outputPrefix}Id`, {
        value: activeDirectory.directoryId,
      });
      new cdk.CfnOutput(stack, `${activeDirectory.outputPrefix}DnsIps`, {
        value: cdk.Fn.join(',', activeDirectory.dnsIps),
      });
    }
  }
}

// tslint:disable-next-line: no-floating-promises
main();
