/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { ConfigService } from '@aws-accelerator/common/src/aws/configservice';
import { ConfigurationRecorder } from 'aws-sdk/clients/configservice';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { getStackJsonOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { LoadConfigurationInput } from '../load-configuration-step';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { createConfigRecorderName, createAggregatorName } from '@aws-accelerator/common-outputs/src/config';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { loadOutputs } from '../utils/load-outputs';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';

interface ConfigServiceInput extends LoadConfigurationInput {
  accountId: string;
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
const organizations = new Organizations();

export const handler = async (input: ConfigServiceInput): Promise<string[]> => {
  console.log(`Enable Config Recorder in account ...`);
  console.log(JSON.stringify(input, null, 2));
  const {
    accountId,
    assumeRoleName,
    configRepositoryName,
    configFilePath,
    configCommitId,
    acceleratorPrefix,
    outputTableName,
    baseline,
  } = input;

  const outputs = await loadOutputs(outputTableName, dynamodb);

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const awsAccount = await organizations.getAccount(accountId);
  if (!awsAccount) {
    // This will never occur unless lambda is called explecitly with invalid AccountId
    throw new Error(`Unable retrive account from Organizations api for "${accountId}"`);
  }
  const configAccount = acceleratorConfig
    .getAccountConfigs()
    .find(([_, accountConfig]) => equalIgnoreCase(accountConfig.email, awsAccount.Email!));
  if (!configAccount) {
    throw new Error(`Account didn't find in Configuration "${accountId}" with email ${awsAccount.Email}`);
  }
  const accountKey = configAccount[0];
  const masterAccountKey = acceleratorConfig.getMandatoryAccountKey('master');
  const centralSecurityRegion = acceleratorConfig['global-options']['central-security-services'].region;
  const supportedRegions = acceleratorConfig['global-options']['supported-regions'];
  const excludeRegions = acceleratorConfig['global-options']['central-security-services']['config-excl-regions'];
  const regions = supportedRegions.filter(r => excludeRegions && !excludeRegions.includes(r));
  console.log(`${accountId}: Excluding Config Recorder for regions from account "${accountId}"...`);
  console.log(`${accountId}: ${JSON.stringify(excludeRegions, null, 2)}`);

  const globalOptions = acceleratorConfig['global-options'];
  const securityAccountKey = acceleratorConfig.getMandatoryAccountKey('central-security');
  const centralOperationsKey = acceleratorConfig.getMandatoryAccountKey('central-operations');

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
    accountKey,
    roleKey: 'ConfigRecorderRole',
  });

  if (!configRecorderRole) {
    errors.push(`${accountId}:: No ConfigRecorderRole created in Account "${accountKey}"`);
    return errors;
  }

  const ctSupportedRegions = acceleratorConfig['global-options']['control-tower-supported-regions'];
  const credentials = await sts.getCredentialsForAccountAndRole(
    accountId,
    acceleratorConfig['global-options']['ct-baseline']
      ? acceleratorConfig['global-options']['organization-admin-role']!
      : assumeRoleName,
  );
  // Creating Config Recorder
  for (const region of regions) {
    // Skip creation of Config Recorder in CONTROL_TOWER deployed regions in all accounts
    if (baseline === 'CONTROL_TOWER' && ctSupportedRegions.includes(region) && accountKey !== masterAccountKey) {
      console.log(
        `Skipping creation of Config Recorder in account "${accountKey}: ${region}" for baseline "${baseline}"`,
      );
      continue;
    }
    console.log(`Creating Config Recorder in ${accountKey}/${region}`);
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

      console.log(`${accountId}::${region}:: Enabling Config Recorder`);
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

  // Create Config Aggregator in Management Account
  const configService = new ConfigService(credentials, centralSecurityRegion);

  if (
    (accountKey === masterAccountKey && globalOptions['aws-org-management']['config-aggr']) ||
    (accountKey === securityAccountKey &&
      baseline !== 'CONTROL_TOWER' &&
      globalOptions['central-security-services']['config-aggr']) || // Don't deploy if CT; CT does it.
    (accountKey === centralOperationsKey && globalOptions['central-operations-services']['config-aggr']) ||
    (accountKey === logAccountKey && globalOptions['central-log-services']['config-aggr'])
  ) {
    const configAggregatorRole = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'ConfigAggregatorRole',
    });
    if (!configAggregatorRole) {
      errors.push(`${accountId}:: No Aggregator Role created in Master Account ${accountKey}`);
    } else {
      if (accountKey !== masterAccountKey) {
        // Register Delegated Admin
        try {
          await organizations.registerDelegatedAdministrator(accountId, 'config.amazonaws.com');
          console.log(
            `${accountKey} account registered as delegated administrator for AWS Config in the organization.`,
          );
        } catch (error) {
          console.log(`Error registering delgated administrator ${error}`);
        }
      }

      const enableAggregator = await createAggregator(
        configService,
        accountId,
        centralSecurityRegion,
        acceleratorPrefix,
        configAggregatorRole.roleArn,
      );
      errors.push(...enableAggregator);
    }
  } else if (
    (accountKey === securityAccountKey &&
      baseline !== 'CONTROL_TOWER' &&
      globalOptions['central-security-services']['config-aggr'] === false) || // Don't deploy if CT; CT does it.
    (accountKey === centralOperationsKey && globalOptions['central-operations-services']['config-aggr'] === false) ||
    (accountKey === logAccountKey && globalOptions['central-log-services']['config-aggr'] === false)
  ) {
    const aggregatorName = createAggregatorName(acceleratorPrefix);

    const aseaAggregator = (await configService.describeConfigurationAggregators({})).ConfigurationAggregators?.find(
      i => i.ConfigurationAggregatorName === aggregatorName,
    );

    if (aseaAggregator) {
      // Found it.
      console.log(
        `Config Aggregrator '${aggregatorName}' found in '${accountKey}' and config-aggr is false. Deleting...'`,
      );
      const disableAggregator = await deleteAggregator(configService, accountId, centralSecurityRegion, aggregatorName);
      errors.push(...disableAggregator);
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

async function deleteAggregator(
  configService: ConfigService,
  accountId: string,
  region: string,
  aggregatorName: string,
) {
  const errors: string[] = [];

  // Delete Config Aggregator
  try {
    await configService.deleteAggregator({
      ConfigurationAggregatorName: aggregatorName,
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
