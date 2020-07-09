import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account, getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { createMadUserPasswordSecretName, MadOutput } from '@aws-pbmm/common-outputs/lib/mad';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { LoadConfigurationInput } from '../load-configuration-step';
import { VpcOutputFinder } from '@aws-pbmm/common-outputs/lib/vpc';

const VALID_STATUSES: string[] = ['Requested', 'Creating', 'Created', 'Active', 'Inoperable', 'Impaired', 'Restoring'];

interface AdConnectorInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  accounts: Account[];
  assumeRoleName: string;
  configRepositoryName: string;
  configFilePath: string;
  configCommitId: string;
  stackOutputSecretId: string;
}

export interface AdConnectorOutput {
  accountId: string;
  directoryId: string;
  assumeRoleName: string;
}

export const handler = async (input: AdConnectorInput) => {
  console.log(`Creating AD Connector in account ...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    acceleratorPrefix,
    accounts,
    assumeRoleName,
    configRepositoryName,
    configFilePath,
    configCommitId,
    stackOutputSecretId,
  } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const secrets = new SecretsManager();
  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const sts = new STS();

  const adConnectorOutputs: AdConnectorOutput[] = [];
  for (const [accountKey, mandatoryConfig] of acceleratorConfig.getMandatoryAccountConfigs()) {
    const adcConfig = mandatoryConfig.deployments?.adc;
    if (!adcConfig || !adcConfig.deploy) {
      continue;
    }

    // Getting the MAD outputs from stacks output
    const madOutputs: MadOutput[] = getStackJsonOutput(outputs, {
      accountKey: adcConfig['connect-account-key'],
      outputType: 'MadOutput',
    });

    // Finding the MAD output based on connect-dir-id
    const madOutput = madOutputs.find(output => output.id === adcConfig['connect-dir-id']);
    if (!madOutput) {
      console.warn(`Cannot find madOutput with account ${adcConfig['connect-account-key']}`);
      continue;
    }

    // Finding the account specific MAD configuration based on dir-id and connect-dir-id
    const madDeployConfig = acceleratorConfig
      .getMandatoryAccountConfigs()
      .map(([_, accountConfig]) => accountConfig)
      .find(accountConfig => accountConfig.deployments?.mad?.['dir-id'] === adcConfig['connect-dir-id']);
    if (!madDeployConfig) {
      console.warn(`Cannot find MAD Config with account ${adcConfig['connect-account-key']}`);
      continue;
    }

    const madConfig = madDeployConfig.deployments?.mad;
    if (!madConfig) {
      console.warn(`Cannot find MAD Config with account ${adcConfig['connect-account-key']}`);
      continue;
    }

    const adConnectorGroup = madConfig['adc-group'];
    const adConnectorUser = madConfig['ad-users'].find(u => u.groups.includes(adConnectorGroup));
    if (!adConnectorUser) {
      console.warn(`Cannot find AD Connector user in account ${adcConfig['connect-account-key']}`);
      continue;
    }

    // Getting VPC outputs by account name
    const vpcName = adcConfig['vpc-name'];
    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      vpcName,
    });
    if (!vpcOutput) {
      console.warn(`Cannot find VPC with name "${vpcName}"`);
      continue;
    }

    // Find subnets based on ADC Config subnet name
    const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === adcConfig.subnet).map(s => s.subnetId);

    const accountId = getAccountId(accounts, accountKey);
    if (!accountId) {
      console.warn(`Cannot find account with accountKey ${accountKey}`);
      continue;
    }

    // TODO Getting admin password, update with user specific password after creating AD Users and Groups
    const madPasswordSecretArn = createMadUserPasswordSecretName({
      acceleratorPrefix,
      accountKey: adcConfig['connect-account-key'],
      userId: adConnectorUser.user,
    });
    const madPassword = await secrets.getSecret(madPasswordSecretArn);

    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const directoryService = new DirectoryService(credentials);
    const adConnectors = await directoryService.getADConnectors();
    const adConnector = adConnectors.find(
      o => o.domain === madConfig['dns-domain'] && VALID_STATUSES.includes(o.status),
    );
    console.log('Active AD Connector', adConnector);

    // Creating AD Connector if there are no active AD Connector with the given dns-domain
    if (!adConnector) {
      const directoryId = await directoryService.createAdConnector({
        Name: madConfig['dns-domain'],
        ShortName: madConfig['netbios-domain'],
        Password: madPassword.SecretString!,
        Size: adcConfig.size,
        ConnectSettings: {
          VpcId: vpcOutput.vpcId,
          SubnetIds: subnetIds,
          CustomerDnsIps: madOutput.dnsIps.split(','),
          CustomerUserName: adConnectorUser.user,
        },
      });
      if (directoryId) {
        adConnectorOutputs.push({
          accountId,
          directoryId,
          assumeRoleName,
        });
      }
    }
  }
  return { adConnectorOutputs, outputCount: adConnectorOutputs.length };
};
