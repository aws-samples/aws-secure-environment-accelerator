import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { GlobalOptionsDeployment } from '../common/global-options';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { SecretsStack } from '../../../../common-cdk/lib/core/secrets-stack';
import * as iam from '@aws-cdk/aws-iam';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { ActiveDirectory } from '../common/active-directory';
import { VpcOutput } from '../apps/phase-1';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const app = new cdk.App();

  const globalOptionsConfig = acceleratorConfig['global-options'];
  const zonesConfig = globalOptionsConfig.zones;
  const zonesAccountKey = zonesConfig.account;

  const deployment = new AcceleratorStack(app, 'GlobalOptionsDNSResolversStack', {
    env: {
      account: getAccountId(accounts, zonesAccountKey),
      region: cdk.Aws.REGION,
    },
    stackName: `PBMMAccel-GlobalOptionsDNSResolvers`,
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
  });

  new GlobalOptionsDeployment(deployment, `GlobalOptionsDNSResolvers`, {
    accounts,
    outputs,
    context,
    acceleratorConfig,
  });

  const secretsStack = new SecretsStack(app, 'Secrets', {
    env: {
      account: getAccountId(accounts, 'master'),
      region: cdk.Aws.REGION,
    },
    acceleratorName: context.acceleratorName,
    acceleratorPrefix: context.acceleratorPrefix,
    stackName: 'PBMMAccel-Secrets',
  });

  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];
  for (const accountConfig of Object.values(mandatoryAccountConfig)) {
    const madDeploymentConfig = accountConfig.deployments.mad;
    if (madDeploymentConfig && madDeploymentConfig.deploy) {
      const accountId = getAccountId(accounts, accountConfig['account-name']);
      const madPassword = secretsStack.createSecret('MadPassword', {
        secretName: `accelerator/${accountConfig['account-name']}/mad/password`,
        description: 'Password for Managed Active Directory.',
        generateSecretString: {
          passwordLength: madDeploymentConfig['password-policies']['min-len'],
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

      const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
        outputType: 'VpcOutput',
      });
      const vpcOutput = vpcOutputs.find(output => output.vpcName === madDeploymentConfig['vpc-name']);
      const vpcId = vpcOutput!.vpcId;
      const subnetIds = vpcOutput!.subnets
        .filter(s => s.subnetName === madDeploymentConfig.subnet)
        .map(s => s.subnetId);

      const activeDirectory = new ActiveDirectory(stack, 'Microsoft AD', {
        madDeploymentConfig,
        subnetInfo: {
          vpcId,
          subnetIds,
        },
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
