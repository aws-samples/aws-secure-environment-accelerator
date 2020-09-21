import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { Account } from '@aws-accelerator/common-outputs/src/accounts';
import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getOutput } from './utils';

/**
 * Outputs for network related deployments will be found in following phases
 *
 */

/**
 *
 * @param outputsTableName
 * @param client
 * @param config
 * @param account
 *
 * @returns void
 */
export async function saveNetworkOutputs(
  outputsTableName: string,
  dynamodb: DynamoDB,
  config: AcceleratorConfig,
  account: Account,
) {
  const vpcConfigs = config.getVpcConfigs();
  for (const { accountKey, vpcConfig, ouKey } of vpcConfigs) {
    const outputs: StackOutput[] = await getOutput(outputsTableName, `${accountKey}-${vpcConfig.region}-1`, dynamodb);
  }
}
