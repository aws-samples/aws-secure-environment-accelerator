import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { getStackJsonOutput, StackOutput } from '@aws-pbmm/common-outputs/lib/outputs';
import { getAccountId, Account } from '@aws-pbmm/common-outputs/lib/accounts';

interface AdConnectorInput {
  accounts: Account[];
  assumeRoleName: string;
  stackOutputSecretId: string;
  configSecretSourceId: string;
}

interface MadOutput {
  id: number;
  vpcName: string;
  directoryId: string;
  dnsIps: string;
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

  const { accounts, assumeRoleName, stackOutputSecretId, configSecretSourceId: configSecretId } = input;

  const secrets = new SecretsManager();
  const configString = await secrets.getSecret(configSecretId);
  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const adConnectorOutputs: AdConnectorOutput[] = [];

  const acceleratorConfig = AcceleratorConfig.fromString(configString.SecretString!);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const sts = new STS();

  for (const [accountKey, mandatoryConfig] of Object.entries(acceleratorConfig['mandatory-account-configs'])) {
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
    const madOuput = madOutputs.find(output => output.id === adcConfig['connect-dir-id']);
    if (!madOuput) {
      throw new Error(`Cannot find madOuput with account ${adcConfig['connect-account-key']}`);
    }

    // Finding the account specific MAD configuration based on dir-id and connect-dir-id
    const madDeployConfig = Object.values(acceleratorConfig['mandatory-account-configs']).find(
      config => config.deployments?.mad?.['dir-id'] === adcConfig['connect-dir-id'],
    );
    if (!madDeployConfig) {
      throw new Error(`Cannot find MAD Config with account ${adcConfig['connect-account-key']}`);
    }

    const madConfig = madDeployConfig.deployments?.mad;
    if (!madConfig) {
      throw new Error(`Cannot find MAD Config with account ${adcConfig['connect-account-key']}`);
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
    const madPassword = await secrets.getSecret(`accelerator/${adcConfig['connect-account-key']}/mad/password`);
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    const directoryService = new DirectoryService(credentials);
    const adConnectors = await directoryService.getADConnectors();
    const adConnector = adConnectors.find(o => o.domain === madConfig['dns-domain'] && o.status === 'Active');
    console.log('Active AD Conenctor', adConnector);

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
          CustomerDnsIps: madOuput.dnsIps.split(','),
          CustomerUserName: 'admin', // TODO update username after creating AD Users and Groups
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
