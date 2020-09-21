import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { getOutput, SaveOutputsInput } from './utils';
import { VpcOutputFinder } from '@aws-accelerator/common-outputs/src/vpc';
import { Stack } from 'aws-sdk/clients/opsworks';

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
export async function saveNetworkOutputs(props: SaveOutputsInput) {
  const { acceleratorPrefix, account, config, dynamodb, outputsTableName, ssm, region } = props;
  const vpcConfigs = config.getVpcConfigs();
  const localVpcConfigs = vpcConfigs.filter(vc => vc.accountKey === account.key && vc.vpcConfig.region === region);
  const outputs: StackOutput[] = await getOutput(outputsTableName, `${account.key}-${region}-1`, dynamodb);
  let index = 1;
  for (const { vpcConfig, accountKey } of localVpcConfigs) {
    const vpcOutput = VpcOutputFinder.tryFindOneByAccountAndRegionAndName({
      outputs,
      accountKey,
      vpcName: vpcConfig.name,
    });
    if (!vpcOutput) {
      console.warn(`VPC "${vpcConfig.name}" in account "${accountKey}" is not created`);
      continue;
    }
    await ssm.putParameter(`/${acceleratorPrefix}/network/vpc/${index}/name`, vpcOutput.vpcName);
    await ssm.putParameter(`/${acceleratorPrefix}/network/vpc/${index}/id`, vpcOutput.vpcId);
    await ssm.putParameter(`/${acceleratorPrefix}/network/vpc/${index}/cidr`, vpcOutput.cidrBlock);
    index++;
  }
}
