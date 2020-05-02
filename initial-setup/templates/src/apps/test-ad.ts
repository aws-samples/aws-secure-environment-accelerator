import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import * as iam from '@aws-cdk/aws-iam';
import { pascalCase } from 'pascal-case';
import { SecretsStack } from '@aws-pbmm/common-cdk/lib/core/secrets-stack';
import { VpcOutput } from './phase-1';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { ADUsersAndGroups } from '../common/ad-users-groups';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const DomainMemberSGID = 'sg-0e03e46dc71d924a5';
  const KeyPairName = 'test';
  const S3BucketName = 'solutions-reference';
  const S3KeyPrefix = 'aws-landing-zone/v2.3.1/scripts/';
  const LatestRdgwAmiId = 'ami-02c212eea0b630bbf';

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

    const stack = new AcceleratorStack(app, `TestADUsersAndGroups`, {
      env: {
        account: accountId,
        region: cdk.Aws.REGION,
      },
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
      stackName: `PBMMAccel-${pascalCase('adUsersAndGroups')}`,
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

    const adUsersAndGroups = new ADUsersAndGroups(stack, 'RDGWHost', {
      madDeploymentConfig,
      latestRdgwAmiId: LatestRdgwAmiId, // TODO get latest ami id
      domainMemberSGID: DomainMemberSGID, // create new SG
      keyPairName: KeyPairName, // TODO create key pair
      subnetIds,
      adminPassword: madPassword,
      s3BucketName: S3BucketName,
      s3KeyPrefix: S3KeyPrefix,
      stackId: stack.stackId,
      stackName: stack.stackName,
    });
  }

  //   createADConnectorUser: {
  //     commands: {
  //       'a-configure-ad-connector-user': {
  //         command: {
  //           'Fn::Join': [
  //             '',
  //             [
  //               'powershell.exe -Command "C:\\cfn\\scripts\\AD-connector-setup.ps1 -GroupName \'',
  //               `${ConnectorGroup}`,
  //               "' -UserName '",
  //               `${ConnectorUser}`,
  //               "' -Password '",
  //               `${ConnectorPassword}`,
  //               "' -DomainAdminUser '",
  //               `${DomainNetBIOSName}`,
  //               '\\',
  //               `${DomainAdminUser}`,
  //               "' -DomainAdminPassword '",
  //               `${DomainAdminPassword.SecretString!}`,
  //               "' -PasswordNeverExpires '",
  //               `${PasswordNeverExpires}`,
  //               '\'"',
  //             ],
  //           ],
  //         },
  //         waitAfterCompletion: '0',
  //       },
  //     },
  //   },
}

// tslint:disable-next-line: no-floating-promises
main();
