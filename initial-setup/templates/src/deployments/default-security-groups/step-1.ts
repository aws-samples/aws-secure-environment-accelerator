import * as c from '@aws-pbmm/common-lambda/lib/config';
import { AccountStacks } from '../../common/account-stacks';
import * as cdk from '@aws-cdk/core';
import { StackOutput, getStackJsonOutput, VpcOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { VpcDefaultSecurityGroup } from '@custom-resources/vpc-default-security-group';

export interface DefaultSecurityGroupStep1Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 *
 *  Deletes the inbound and outbound rules of default security group
 *  and attach tags to the default security group
 *
 */
export async function step1(props: DefaultSecurityGroupStep1Props) {
  const { accountStacks, config, outputs } = props;
  const accountKeys = config.getAccountConfigs().map(([accountKey, _]) => accountKey);

  for (const accountKey of accountKeys) {
    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      outputType: 'VpcOutput',
      accountKey,
    });

    if (vpcOutputs.length === 0) {
      console.log(`No VPC found in the account ${accountKey}`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }

    for (const [index, vpcOutput] of vpcOutputs.entries()) {
      deleteDefaultSecurityGroupRules(accountStack, vpcOutput.vpcId, accountStack.acceleratorName, accountKey, index);
    }
  }
}

const deleteDefaultSecurityGroupRules = (
  scope: cdk.Construct,
  vpcId: string,
  acceleratorName: string,
  accountKey: string,
  index: number,
): void => {
  new VpcDefaultSecurityGroup(scope, `VPCDefaultSecurityGroup${accountKey}${index}`, {
    vpcId,
    acceleratorName,
  });
};
