import { ConfigService } from '@aws-pbmm/common-lambda/lib/aws/configservice';
import { S3 } from '@aws-pbmm/common-lambda/lib/aws/s3';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { LoadConfigurationInput } from '../load-configuration-step';
import { Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';
import { loadAcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config/load';
import { createConfigRecorderName, createAggregatorName } from '@aws-pbmm/common-outputs/lib/config';

interface ConfigServiceInput extends LoadConfigurationInput {
  account: Account;
  assumeRoleName: string;
  acceleratorPrefix: string;
  stackOutputBucketName: string;
  stackOutputBucketKey: string;
  stackOutputVersion: string;
}

interface LogBucketOutputType {
  bucketName: string;
  bucketArn: string;
  encryptionKeyArn: string;
}

interface IamRoleOutputType {
  key: string;
  arn: string;
  name: string;
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
const s3 = new S3();

export const handler = async (input: ConfigServiceInput): Promise<string[]> => {
  console.log(`Enable Config Recorder in account ...`);
  console.log(JSON.stringify(input, null, 2));
  const {
    account,
    assumeRoleName,
    configRepositoryName,
    configFilePath,
    configCommitId,
    acceleratorPrefix,
    stackOutputBucketName,
    stackOutputBucketKey,
    stackOutputVersion,
  } = input;

  const outputsString = await s3.getObjectBodyAsString({
    Bucket: stackOutputBucketName,
    Key: stackOutputBucketKey,
    VersionId: stackOutputVersion,
  });
  const outputs = JSON.parse(outputsString) as StackOutput[];

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

  const iamRolesOutpus: IamRoleOutputType[] = getStackJsonOutput(outputs, {
    accountKey: account.key,
    outputType: 'IamRole',
  });

  const configRecorderRole = iamRolesOutpus.find(r => r.key === 'ConfigRecorderRole');
  if (!configRecorderRole) {
    console.log(`${accountId}:: No ConfigRecorderRole created in Master Account ${account.key}`);
    errors.push(`${accountId}:: No ConfigRecorderRole created in Master Account ${account.key}`);
    return errors;
  }

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
          configRecorderRole.arn,
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
    const configAggregatorRole = iamRolesOutpus.find(r => r.key === 'ConfigAggregatorRole');
    if (!configAggregatorRole) {
      errors.push(`${accountId}:: No Aggregaror Role created in Master Account ${account.key}`);
    } else {
      const configService = new ConfigService(credentials, centralSecurityRegion);
      const enableAggregator = await createAggregator(
        configService,
        accountId,
        centralSecurityRegion,
        acceleratorPrefix,
        configAggregatorRole.arn,
      );
      errors.push(...enableAggregator);
    }
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
  roleArn: string,
): Promise<string[]> {
  const errors: string[] = [];
  console.log('in createConfigRecorder function', region);
  // Create Config Recorder
  try {
    await configService.createRecorder({
      ConfigurationRecorder: {
        name: createConfigRecorderName(acceleratorPrefix),
        roleARN: roleArn,
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
  roleArn: string,
): Promise<string[]> {
  const errors: string[] = [];

  // Create Config Aggregator
  try {
    await configService.createAggregator({
      ConfigurationAggregatorName: createAggregatorName(acceleratorPrefix),
      OrganizationAggregationSource: {
        RoleArn: roleArn,
        AllAwsRegions: true,
      },
    });
  } catch (error) {
    errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
  }

  return errors;
}
