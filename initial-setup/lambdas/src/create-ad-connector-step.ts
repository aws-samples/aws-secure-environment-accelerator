import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account } from './load-accounts-step';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { getAccountId } from '../../templates/src/utils/accounts';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';

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

export interface VpcSubnetOutput {
  subnetId: string;
  subnetName: string;
  az: string;
}

export interface VpcOutput {
  vpcId: string;
  vpcName: string;
  subnets: VpcSubnetOutput[];
  routeTables: object;
}

export const handler = async (input: AdConnectorInput) => {
  console.log(`Creating AD Connector in account ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts, assumeRoleName, stackOutputSecretId, configSecretSourceId: configSecretId } = input;

  const secrets = new SecretsManager();
  const configString = await secrets.getSecret(configSecretId);
  const outputsString = await secrets.getSecret(stackOutputSecretId);

  const acceleratorConfig = AcceleratorConfig.fromString(configString.SecretString!);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  const sts = new STS();

  for (const [accountKey, mandatoryConfig] of Object.entries(acceleratorConfig['mandatory-account-configs'])) {
    const adcConfig = mandatoryConfig.deployments?.adc;
    if (!adcConfig || !adcConfig.deploy) {
      continue;
    }

    const madOutputs: MadOutput[] = getStackJsonOutput(outputs, {
      accountKey: adcConfig['connect-account-key'],
      outputType: 'MadOutput',
    });

    const madOuput = madOutputs.find(output => output.id === adcConfig['connect-dir-id']);
    if (!madOuput) {
      throw new Error(`Cannot find madOuput with account ${adcConfig['connect-account-key']}`);
    }

    const mandConfig = Object.values(acceleratorConfig['mandatory-account-configs']).find(
      config => config.deployments?.mad?.['dir-id'] === adcConfig['connect-dir-id'],
    );
    if (!mandConfig) {
      throw new Error(`Cannot find MAD Config with account ${adcConfig['connect-account-key']}`);
    }

    const madConfig = mandConfig.deployments?.mad;
    if (!madConfig) {
      throw new Error(`Cannot find MAD Config with account ${adcConfig['connect-account-key']}`);
    }

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey: accountKey,
      outputType: 'VpcOutput',
    });

    const vpc = vpcOutputs.find(output => output.vpcName === adcConfig['vpc-name']);
    if (!vpc) {
      throw new Error(`Cannot find VPC with name "${adcConfig['vpc-name']}"`);
    }

    const subnetIds = vpc.subnets.filter(s => s.subnetName === adcConfig.subnet).map(s => s.subnetId);
    const madPassword = await secrets.getSecret(`accelerator/${adcConfig['connect-account-key']}/mad/password`);
    const accountId = getAccountId(accounts, accountKey);
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);

    const directoryService = new DirectoryService(credentials);
    await directoryService.createAdConnector({
      Name: madConfig['dns-domain'],
      ShortName: madConfig['netbios-domain'],
      Password: madPassword.SecretString!,
      Size: adcConfig.size,
      ConnectSettings: {
        VpcId: vpc.vpcId,
        SubnetIds: subnetIds,
        CustomerDnsIps: madOuput.dnsIps.split(','),
        CustomerUserName: 'admin',
      },
    });
  }
};
