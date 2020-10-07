import { AccountStacks } from '../../common/account-stacks';
import { VpcConfig } from '@aws-accelerator/common-config';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { LogGroup } from '@aws-accelerator/custom-resource-logs-log-group';
import { createLogGroupName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnResolverQueryLoggingConfig, CfnResolverQueryLoggingConfigAssociation } from '@aws-cdk/aws-route53resolver';
import { Context } from '../../utils/context';

export interface VpcStep4Props {
  vpcConfig: VpcConfig;
  vpcId: string;
  accountKey: string;
  accountStacks: AccountStacks;
  outputs: StackOutput[];
  context: Context;
}

export async function step4(props: VpcStep4Props) {
  createVpcDnsQueryLogging(props);
}

function createVpcDnsQueryLogging(props: VpcStep4Props) {
  const { vpcConfig, vpcId, accountStacks, accountKey, outputs, context } = props;

  if (!vpcConfig['dns-resolver-logging']) {
    return;
  }

  const logGroupLambdaRoleOutput = IamRoleOutputFinder.tryFindOneByName({
    outputs,
    accountKey,
    roleKey: 'LogGroupRole',
  });
  if (!logGroupLambdaRoleOutput) {
    console.warn(`Cannot find LogGroupRole, skipping creation of DNS Query Logging for VPC ${vpcConfig.name}`);
    return;
  }

  const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
  if (!accountStack) {
    console.warn(`Cannot find account stack ${accountKey}`);
    return;
  }

  const logGroup = new LogGroup(accountStack, `LogGroup${accountStack}${vpcConfig.name}`, {
    logGroupName: createLogGroupName(`rql/${vpcConfig.name}-${vpcId}`, 0),
    roleArn: logGroupLambdaRoleOutput.roleArn,
  });

  const queryLoggingConfig = new CfnResolverQueryLoggingConfig(accountStack, `Rql${vpcConfig.name}`, {
    destinationArn: logGroup.logGroupArn,
    name: `${context.acceleratorPrefix}rql-${vpcConfig.name}`,
  });

  new CfnResolverQueryLoggingConfigAssociation(accountStack, `RqlAssoc${vpcConfig.name}`, {
    resolverQueryLogConfigId: queryLoggingConfig.ref,
    resourceId: vpcId,
  });
}
