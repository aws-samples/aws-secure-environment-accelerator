import { ConfigService } from '@aws-accelerator/common/src/aws/configservice';
import { ConfigurationRecorder } from 'aws-sdk/clients/configservice';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { LoadConfigurationInput } from '../load-configuration-step';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { createConfigRecorderName, createAggregatorName } from '@aws-accelerator/common-outputs/src/config';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { loadOutputs } from '../utils/load-outputs';

interface ConfigServiceInput extends LoadConfigurationInput {
  account: Account;
  assumeRoleName: string;
  acceleratorPrefix: string;
  outputTableName: string;
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
const dynamodb = new DynamoDB();

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
    outputTableName,
  } = input;

  const outputs = await loadOutputs(outputTableName, dynamodb);

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

  const configRecorderRole = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey: account.key,
    roleKey: 'ConfigRecorderRole',
  });

  if (!configRecorderRole) {
    errors.push(`${accountId}:: No ConfigRecorderRole created in Account "${account.key}"`);
    return errors;
  }

  const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
  for (const region of regions) {
    console.log(`Creating Config Recorder in ${region}`);
    try {
      const configService = new ConfigService(credentials, region);
      const acceleratorRecorderName = createConfigRecorderName(acceleratorPrefix);
      const describeRecorders = await configService.DescribeConfigurationRecorder({});
      const disableAndDeleteRecorders = await disableAndDeleteConfigRecorders({
        acceleratorRecorderName,
        accountId,
        configService,
        recorders: describeRecorders.ConfigurationRecorders,
        region,
        roleArn: configRecorderRole.roleArn,
      });
      errors.push(...disableAndDeleteRecorders);

      const createConfig = await createConfigRecorder({
        configRecorderName: acceleratorRecorderName,
        configService,
        accountId,
        region,
        roleArn: configRecorderRole.roleArn,
      });
      errors.push(...createConfig);

      const describeChannels = await configService.DescribeDeliveryChannelStatus({});
      console.log('deliveryChannels', describeChannels);
      if (describeChannels.DeliveryChannelsStatus && describeChannels.DeliveryChannelsStatus.length > 0) {
        for (const channel of describeChannels.DeliveryChannelsStatus) {
          if (channel.name === acceleratorRecorderName) {
            continue;
          }
          try {
            await configService.deleteDeliveryChannel(channel.name!);
          } catch (error) {
            errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
          }
        }
      }
      const createChannel = await createDeliveryChannel(
        configService,
        accountId,
        region,
        logBucketOutput.bucketName,
        acceleratorRecorderName,
      );
      errors.push(...createChannel);

      console.log(`${account.id}::${region}:: Enabling Config Recorder`);
      const enableConfig = await enableConfigRecorder(configService, accountId, region, acceleratorRecorderName);
      errors.push(...enableConfig);
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
    const configAggregatorRole = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey: account.key,
      roleKey: 'ConfigAggregatorRole',
    });
    if (!configAggregatorRole) {
      errors.push(`${accountId}:: No Aggregaror Role created in Master Account ${account.key}`);
    } else {
      const configService = new ConfigService(credentials, centralSecurityRegion);
      const enableAggregator = await createAggregator(
        configService,
        accountId,
        centralSecurityRegion,
        acceleratorPrefix,
        configAggregatorRole.roleArn,
      );
      errors.push(...enableAggregator);
    }
  }

  console.log(`${accountId}: Errors `, JSON.stringify(errors, null, 2));
  return errors;
};

async function createConfigRecorder(props: {
  configRecorderName: string;
  configService: ConfigService;
  accountId: string;
  region: string;
  roleArn: string;
}): Promise<string[]> {
  const errors: string[] = [];
  const { accountId, configService, region, roleArn, configRecorderName } = props;
  console.log('in createConfigRecorder function', region);
  // Create Config Recorder
  try {
    await configService.createRecorder({
      ConfigurationRecorder: {
        name: configRecorderName,
        roleARN: roleArn,
        recordingGroup: {
          allSupported: true,
          includeGlobalResourceTypes: true,
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
  recorderName: string,
): Promise<string[]> {
  const errors: string[] = [];
  console.log('in createDeliveryChannel function', region);
  // Create Delivery Channel
  try {
    await configService.createDeliveryChannel({
      DeliveryChannel: {
        name: recorderName,
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
  recorderName: string,
): Promise<string[]> {
  const errors: string[] = [];
  console.log('in enableConfigRecorder function', region);
  // Start Recorder
  try {
    await configService.startRecorder({ ConfigurationRecorderName: recorderName });
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

async function disableAndDeleteConfigRecorders(props: {
  configService: ConfigService;
  recorders: ConfigurationRecorder[] | undefined;
  accountId: string;
  region: string;
  acceleratorRecorderName: string;
  roleArn: string;
}): Promise<string[]> {
  const { configService, recorders, accountId, region, acceleratorRecorderName, roleArn } = props;
  const errors: string[] = [];
  if (!recorders) {
    return errors;
  }
  for (const recorder of recorders) {
    if (acceleratorRecorderName === recorder.name && recorder.roleARN === roleArn) {
      console.log(`${accountId}::${region}:: Skipping disable Config Recorder as there is not change.`);
      continue;
    }
    try {
      await configService.stopRecorder({
        ConfigurationRecorderName: recorder.name!,
      });
    } catch (error) {
      console.warn(`${accountId}:${region}: ${error.code}: ${error.message}`);
    }

    try {
      console.log(
        `${accountId}::${region}:: Deleting Config Recorder "${recorder.name}" which is not managed by Accelerator`,
      );
      await configService.deleteConfigurationRecorder(recorder.name!);
    } catch (error) {
      errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
    }
  }
  return errors;
}
