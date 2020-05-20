import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account, getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { LoadConfigurationInput } from '../load-configuration-step';

interface AdConnectorInput extends LoadConfigurationInput {
  accounts: Account[];
  assumeRoleName: string;
  stackOutputSecretId: string;
}

interface MadOutput {
  id: number;
  vpcName: string;
  directoryId: string;
  dnsIps: string;
  passwordArn: string;
}

interface VpcSubnetOutput {
  subnetId: string;
  subnetName: string;
  az: string;
}

interface VpcOutput {
  vpcId: string;
  vpcName: string;
  subnets: VpcSubnetOutput[];
  routeTables: object;
}

export interface AdConnectorOutput {
  accountId: string;
  directoryId: string;
  assumeRoleName: string;
}

export const handler = async (input: AdConnectorInput) => {
  console.log(`Creating AD Connector in account ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts, assumeRoleName, stackOutputSecretId, configRepositoryName, configFilePath, configCommitId } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId
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
      throw new Error(`Cannot find madOutput with account ${adcConfig['connect-account-key']}`);
    }

    // Finding the account specific MAD configuration based on dir-id and connect-dir-id
    const madDeployConfig = acceleratorConfig
      .getMandatoryAccountConfigs()
      .map(([_, accountConfig]) => accountConfig)
      .find(accountConfig => accountConfig.deployments?.mad?.['dir-id'] === adcConfig['connect-dir-id']);
    if (!madDeployConfig) {
      throw new Error(`Cannot find MAD Config with account ${adcConfig['connect-account-key']}`);
    }

    const madConfig = madDeployConfig.deployments?.mad;
    if (!madConfig) {
      throw new Error(`Cannot find MAD Config with account ${adcConfig['connect-account-key']}`);
    }

    const adConnectorGroup = madConfig['adc-group'];
    const adConnectorUser = madConfig['ad-users'].find(u => u.groups.includes(adConnectorGroup));
    if (!adConnectorUser) {
      throw new Error(`Cannot find AD Connector user in account ${adcConfig['connect-account-key']}`);
    }

    // Getting VPC outputs by account name
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });

    // Finding the VPC based on vpc-name from stacks output
    const vpc = vpcOutputs.find(output => output.vpcName === adcConfig['vpc-name']);
    if (!vpc) {
      throw new Error(`Cannot find VPC with name "${adcConfig['vpc-name']}"`);
    }

    // Find subnets based on ADC Config subnet name
    const subnetIds = vpc.subnets.filter(s => s.subnetName === adcConfig.subnet).map(s => s.subnetId);

    const accountId = getAccountId(accounts, accountKey);
    // TODO Getting admin password, update with user specific password after creating AD Users and Groups
    const madPassword = await secrets.getSecret(
      `accelerator/${adcConfig['connect-account-key']}/mad/${adConnectorUser.user}/password`,
    );
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const directoryService = new DirectoryService(credentials);
    const adConnectors = await directoryService.getADConnectors();
    const adConnector = adConnectors.find(o => o.domain === madConfig['dns-domain'] && o.status === 'Active');
    console.log('Active AD Connector', adConnector);

    // Creating AD Connector if there are no active AD Connector with the given dns-domain
    if (!adConnector) {
      const directoryId = await directoryService.createAdConnector({
        Name: madConfig['dns-domain'],
        ShortName: madConfig['netbios-domain'],
        Password: madPassword.SecretString!,
        Size: adcConfig.size,
        ConnectSettings: {
          VpcId: vpc.vpcId,
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
