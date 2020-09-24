import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { LoadConfigurationInput } from '../load-configuration-step';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { saveNetworkOutputs } from './network-outputs';
import { saveIamOutputs } from './iam-outputs';
import { saveElbOutputs } from './elb-outputs';
import { saveEventOutputs } from './event-outputs';
import { saveEncryptsOutputs } from './encrypt-outputs';
import { saveFirewallReplacementOutputs } from './firewall-outputs';

export interface SaveOutputsToSsmInput extends LoadConfigurationInput {
  acceleratorPrefix: string;
  account: Account;
  region: string;
  outputsTableName: string;
  assumeRoleName: string;
  outputUtilsTableName: string;
}

const dynamodb = new DynamoDB();

export const handler = async (input: SaveOutputsToSsmInput) => {
  console.log(`Saving SM Outputs to SSM Parameter store...`);
  console.log(JSON.stringify(input, null, 2));

  const {
    configRepositoryName,
    configFilePath,
    configCommitId,
    outputsTableName,
    account,
    assumeRoleName,
    region,
    outputUtilsTableName,
  } = input;
  // Remove - if prefix ends with -
  const acceleratorPrefix = input.acceleratorPrefix.endsWith('-')
    ? input.acceleratorPrefix.slice(0, -1)
    : input.acceleratorPrefix;

  // Retrieve Configuration from Code Commit with specific commitId
  const config = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });

  const globalRegions = config['global-options']['additional-global-output-regions'];
  const smRegion = config['global-options']['aws-org-master'].region;

  // TODO preparing list of regions to create IAM parameters
  const iamRegions = [...globalRegions, smRegion];

  if (iamRegions.includes(region)) {
    // Store Identity Outputs to SSM Parameter Store
    await saveIamOutputs({
      acceleratorPrefix,
      config,
      dynamodb,
      outputsTableName,
      assumeRoleName,
      account,
      region,
      outputUtilsTableName,
    });
  }

  // Store Network Outputs to SSM Parameter Store
  await saveNetworkOutputs({
    acceleratorPrefix,
    config,
    dynamodb,
    outputsTableName,
    assumeRoleName,
    account,
    region,
    outputUtilsTableName,
  });

  // Store ELB Outputs to SSM Parameter Store
  await saveElbOutputs({
    acceleratorPrefix,
    account,
    assumeRoleName,
    config,
    dynamodb,
    outputUtilsTableName,
    outputsTableName,
    region,
  });

  // Store Event Outputs to SSM Parameter Store
  await saveEventOutputs({
    acceleratorPrefix,
    account,
    assumeRoleName,
    config,
    dynamodb,
    outputUtilsTableName,
    outputsTableName,
    region,
  });

  // Store Encrypt outputs to SSM Parameter Store
  await saveEncryptsOutputs({
    acceleratorPrefix,
    account,
    assumeRoleName,
    config,
    dynamodb,
    outputUtilsTableName,
    outputsTableName,
    region,
  });

  // Store Firewall Outputs to SSM Parameter Store
  await saveFirewallReplacementOutputs({
    acceleratorPrefix,
    account,
    assumeRoleName,
    config,
    dynamodb,
    outputUtilsTableName,
    outputsTableName,
    region,
  });

  return {
    status: 'SUCCESS',
  };
};
