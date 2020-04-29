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
import { pascalCase } from 'pascal-case';
import { JsonOutputValue } from '../common/json-output';
import { AccountDefaultSettingsAssets } from '../common/account-default-settings-assets';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

export const OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION = 'KmsKeyIdForEbsDefaultEncryption';

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
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
    const madDeploymentConfig = accountConfig.deployments?.mad;
    if (!madDeploymentConfig || !madDeploymentConfig.deploy) {
      continue;
    }
    const accountId = getAccountId(accounts, accountKey);
    const madPassword = secretsStack.createSecret('MadPassword', {
      secretName: `accelerator/${accountKey}/mad/password`,
      description: 'Password for Managed Active Directory.',
      generateSecretString: {
        passwordLength: 16,
      },
      principals: [new iam.AccountPrincipal(accountId)],
    });

    const stack = new AcceleratorStack(app, `${accountKey}`, {
      env: {
        account: accountId,
        region: cdk.Aws.REGION,
      },
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
      stackName: `PBMMAccel-${pascalCase(accountKey)}`,
    });

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(output => output.vpcName === madDeploymentConfig['vpc-name']);
    if (!vpcOutput) {
      throw new Error(`Cannot find output with vpc name ${madDeploymentConfig['vpc-name']}`);
    }

    const vpcId = vpcOutput.vpcId;
    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === madDeploymentConfig.subnet).map(s => s.subnetId);

    const activeDirectory = new ActiveDirectory(stack, 'Microsoft AD', {
      madDeploymentConfig,
      subnetInfo: {
        vpcId,
        subnetIds,
      },
      password: madPassword,
    });

    new JsonOutputValue(stack, 'MadOutput', {
      type: 'MadOutput',
      value: {
        id: madDeploymentConfig['dir-id'],
        vpcName: madDeploymentConfig['vpc-name'],
        directoryId: activeDirectory.directoryId,
        dnsIps: cdk.Fn.join(',', activeDirectory.dnsIps),
      },
    });

    const accountDefaultSettingsAssets = new AccountDefaultSettingsAssets(stack, '', {
      dummy: '',
    });

    // store the s3 bucket arn for later reference
    new cdk.CfnOutput(stack, OUTPUT_KMS_KEY_ID_FOR_EBS_DEFAULT_ENCRYPTION, {
      value: accountDefaultSettingsAssets.kmsKeyIdForEbsDefaultEncryption,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();
