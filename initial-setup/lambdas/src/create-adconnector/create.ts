import { DirectoryService } from '@aws-pbmm/common-lambda/lib/aws/directory-service';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Account, getAccountId } from '@aws-pbmm/common-outputs/lib/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { createMadUserPasswordSecretName } from '@aws-pbmm/common-outputs/lib/mad';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { LoadConfigurationInput } from '../load-configuration-step';

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
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });

    // Finding the VPC based on vpc-name from stacks output
    const vpc = vpcOutputs.find(output => output.vpcName === adcConfig['vpc-name']);
    if (!vpc) {
      console.warn(`Cannot find VPC with name "${adcConfig['vpc-name']}"`);
      continue;
    }

    // Find subnets based on ADC Config subnet name
    const subnetIds = vpc.subnets.filter(s => s.subnetName === adcConfig.subnet).map(s => s.subnetId);

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

handler({
  acceleratorPrefix: 'PBMMAccel-',
  assumeRoleName: 'PBMMAccel-PipelineRole',
  stackOutputSecretId: 'arn:aws:secretsmanager:ca-central-1:687384172140:secret:accelerator/outputs-X8I8cL',
  configFilePath: 'config.json',
  configCommitId: '1f5ed7a254d1c203d07a27e7ffbda972aef856e9',
  configRepositoryName: 'PBMMAccel-Config-Repo',
  accounts: [
    {
      key: 'shared-network',
      id: '007307298200',
      arn: 'arn:aws:organizations::687384172140:account/o-9q2rluozke/007307298200',
      name: 'ggindera-pbmm-shared-network',
      email: 'ggindera+pbmm-mandatory-shared-network@amazon.com',
      ou: 'core',
    },
    {
      key: 'operations',
      id: '278816265654',
      arn: 'arn:aws:organizations::687384172140:account/o-9q2rluozke/278816265654',
      name: 'ggindera-pbmm-operations',
      email: 'ggindera+pbmm-mandatory-operations@amazon.com',
      ou: 'core',
    },
    {
      key: 'perimeter',
      id: '422986242298',
      arn: 'arn:aws:organizations::687384172140:account/o-9q2rluozke/422986242298',
      name: 'ggindera-pbmm-perimeter',
      email: 'ggindera+pbmm-mandatory-perimeter@amazon.com',
      ou: 'core',
    },
    {
      key: 'master',
      id: '687384172140',
      arn: 'arn:aws:organizations::687384172140:account/o-9q2rluozke/687384172140',
      name: 'ggindera+pbmm@amazon.com',
      email: 'ggindera+pbmm@amazon.com',
      ou: 'core',
      type: 'primary',
    },
    {
      key: 'log-archive',
      id: '272091715658',
      arn: 'arn:aws:organizations::687384172140:account/o-9q2rluozke/272091715658',
      name: 'ggindera-pbmm-logs',
      email: 'ggindera+pbmm-lz-logs@amazon.com',
      ou: 'core',
      type: 'log-archive',
    },
    {
      key: 'security',
      id: '122259674264',
      arn: 'arn:aws:organizations::687384172140:account/o-9q2rluozke/122259674264',
      name: 'ggindera-pbmm-security',
      email: 'ggindera+pbmm-lz-security@amazon.com',
      ou: 'core',
      type: 'security',
    },
    {
      key: 'shared-services',
      id: '378053304141',
      arn: 'arn:aws:organizations::687384172140:account/o-9q2rluozke/378053304141',
      name: 'ggindera-pbmm-shared-services',
      email: 'ggindera+pbmm-lz-shared-services@amazon.com',
      ou: 'core',
      type: 'shared-services',
    },
    {
      key: 'fun-acct',
      id: '934027390063',
      arn: 'arn:aws:organizations::687384172140:account/o-9q2rluozke/934027390063',
      name: 'ggindera-pbmm-workload-fun',
      email: 'ggindera+pbmm-workload-fun@amazon.com',
      ou: 'sandbox',
    },
  ],
});
