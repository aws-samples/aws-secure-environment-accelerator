import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import { Limiter, Limit } from '../../utils/limits';
import { Account } from '../../utils/accounts';


export interface VpcStep1Props {
  accountStacks: AccountStacks;
  accounts: Account[];
  config: AcceleratorConfig;
  limiter: Limiter;
}

export async function step1(props: VpcStep1Props) {
  // Create all the VPCs for accounts and organizational units
  for (const { ouKey, accountKey, vpcConfig, deployments } of props.config.getVpcConfigs()) {
  }
}