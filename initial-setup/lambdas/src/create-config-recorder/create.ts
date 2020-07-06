import { ConfigService } from '@aws-pbmm/common-lambda/lib/aws/configservice';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { LoadConfigurationInput } from '../load-configuration-step';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { createConfigRecorderName, createAggregatorName } from '@aws-pbmm/common-outputs/lib/config';

interface ConfigServiceInput extends LoadConfigurationInput {
  account: Account;
  assumeRoleName: string;
  stackOutputSecretId: string;
  acceleratorPrefix: string;
}

interface LogBucketOutputType {
  bucketName: string;
  bucketArn: string;
  encryptionKeyArn: string;
}

const CustomErrorMessage = [
  {
    code: 'AuthFailure',
    message: 'Region Not Enabled',
  },
  {
    code: 'OptInRequired',
    message: 'Region not Opted-in',
  },
];

const sts = new STS();
const secrets = new SecretsManager();

export const handler = async (input: ConfigServiceInput): Promise<string[]> => {
  console.log(`Enable Config Recorder in account ...`);
  console.log(JSON.stringify(input, null, 2));
  const {
    account,
    assumeRoleName,
    configRepositoryName,
    configFilePath,
    configCommitId,
    stackOutputSecretId,
    acceleratorPrefix,
  } = input;

  const outputsString = await secrets.getSecret(stackOutputSecretId);
  const outputs = JSON.parse(outputsString.SecretString!) as StackOutput[];

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const accountId = account.id;
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const centralSecurityRegion = acceleratorConfig['global-options']['central-security-services'].region;
  const supportedRegions = acceleratorConfig['global-options']['supported-regions'];
  const excludeRegions = acceleratorConfig['global-options']['central-security-services']['config-excl-regions'];
  const regions = supportedRegions.filter(r => excludeRegions && !excludeRegions.includes(r));
  console.log(`${accountId}: Excluding Config Recorder for regions from account "${accountId}"...`);
  console.log(`${accountId}: ${JSON.stringify(excludeRegions, null, 2)}`);

  const logAccountKey = acceleratorConfig.getMandatoryAccountKey('central-log');
  const logBucketOutputs: LogBucketOutputType[] = getStackJsonOutput(outputs, {
    accountKey: logAccountKey,
    outputType: 'LogBucket',
  });
  const logBucketOutput = logBucketOutputs?.[0];
  if (!logBucketOutput) {
    throw new Error(`Cannot find central log bucket for log account ${logAccountKey}`);
  }

  const errors: string[] = [];
  const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
  for (const region of regions) {
    console.log(`Creating Config Recorder in ${region}`);
    try {
      const configService = new ConfigService(credentials, region);
      const describeRecorders = await configService.DescribeConfigurationRecorder({});
      console.log('configurationRecorders', describeRecorders, region);
      if (!describeRecorders.ConfigurationRecorders || describeRecorders.ConfigurationRecorders?.length === 0) {
        const createConfig = await createConfigRecorder(
          configService,
          accountId,
          region,
          centralSecurityRegion,
          acceleratorPrefix,
        );
        errors.push(...createConfig);
      }

      const describeChannels = await configService.DescribeDeliveryChannelStatus({});
      console.log('deliveryChannels', describeChannels);
      if (!describeChannels.DeliveryChannelsStatus || describeChannels.DeliveryChannelsStatus.length === 0) {
        const createChannel = await createDeliveryChannel(
          configService,
          accountId,
          region,
          logBucketOutput.bucketName,
          acceleratorPrefix,
        );
        errors.push(...createChannel);
      }

      const describeRecordingStatus = await configService.DescribeConfigurationRecorderStatus({});
      console.log('describeRecordingStatus', describeRecordingStatus);
      if (
        describeRecordingStatus.ConfigurationRecordersStatus &&
        describeRecordingStatus.ConfigurationRecordersStatus.length > 0 &&
        !describeRecordingStatus.ConfigurationRecordersStatus[0].recording
      ) {
        const enableConfig = await enableConfigRecorder(configService, accountId, region, acceleratorPrefix);
        errors.push(...enableConfig);
      }
    } catch (error) {
      errors.push(
        `${accountId}:${region}: ${error.code}: ${
          CustomErrorMessage.find(cm => cm.code === error.code)?.message || error.message
        }`,
      );
      continue;
    }
  }

  if (account.key === masterAccountKey) {
    const configService = new ConfigService(credentials, centralSecurityRegion);
    const enableAggregator = await createAggregator(configService, accountId, centralSecurityRegion, acceleratorPrefix);
    errors.push(...enableAggregator);
  }

  console.log(`${accountId}: Errors `, JSON.stringify(errors, null, 2));
  return errors;
};

async function createConfigRecorder(
  configService: ConfigService,
  accountId: string,
  region: string,
  centralSecurityRegion: string,
  acceleratorPrefix: string,
): Promise<string[]> {
  const errors: string[] = [];
  console.log('in createConfigRecorder function', region);
  // Create Config Recorder
  try {
    await configService.createRecorder({
      ConfigurationRecorder: {
        name: createConfigRecorderName(acceleratorPrefix),
        roleARN: `arn:aws:iam::${accountId}:role/${acceleratorPrefix}ConfigRecorderRole`,
        recordingGroup: {
          allSupported: true,
          includeGlobalResourceTypes: region === centralSecurityRegion ? true : false,
        },
      },
    });
  } catch (error) {
    errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
  }
  return errors;
}

async function createDeliveryChannel(
  configService: ConfigService,
  accountId: string,
  region: string,
  bucketName: string,
  acceleratorPrefix: string,
): Promise<string[]> {
  const errors: string[] = [];
  console.log('in createDeliveryChannel function', region);
  // Create Delivery Channel
  try {
    await configService.createDeliveryChannel({
      DeliveryChannel: {
        name: createConfigRecorderName(acceleratorPrefix),
        s3BucketName: bucketName,
        configSnapshotDeliveryProperties: {
          deliveryFrequency: 'TwentyFour_Hours',
        },
      },
    });
  } catch (error) {
    errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
  }
  return errors;
}

async function enableConfigRecorder(
  configService: ConfigService,
  accountId: string,
  region: string,
  acceleratorPrefix: string,
): Promise<string[]> {
  const errors: string[] = [];
  console.log('in enableConfigRecorder function', region);
  // Start Recorder
  try {
    await configService.startRecorder({ ConfigurationRecorderName: createConfigRecorderName(acceleratorPrefix) });
  } catch (error) {
    errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
  }
  return errors;
}

async function createAggregator(
  configService: ConfigService,
  accountId: string,
  region: string,
  acceleratorPrefix: string,
): Promise<string[]> {
  const errors: string[] = [];

  // Create Config Aggregator
  try {
    await configService.createAggregator({
      ConfigurationAggregatorName: createAggregatorName(acceleratorPrefix),
      OrganizationAggregationSource: {
        RoleArn: `arn:aws:iam::${accountId}:role/${acceleratorPrefix}ConfigAggregatorRole`,
        AllAwsRegions: true,
      },
    });
  } catch (error) {
    errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
  }

  return errors;
}
