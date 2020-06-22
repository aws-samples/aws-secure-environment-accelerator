import * as ec2 from '@aws-cdk/aws-ec2';
import * as s3 from '@aws-cdk/aws-s3';
import { StackOutput, VpcOutput, getStackJsonOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AccountStack, AccountStacks } from '../../common/account-stacks';
import { FlowLogContainer } from '../../common/flow-log-container';
import { AccountBuckets } from '../defaults';

export interface VpcStep2Props {
  accountBuckets: AccountBuckets;
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
  outputs: StackOutput[];
}

export async function step2(props: VpcStep2Props) {
  createFlowLogs(props);
}

function createFlowLogs(props: VpcStep2Props) {
  const { accountBuckets, accountStacks, config, outputs } = props;
  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    const flowLogs = vpcConfig['flow-logs'];
    if (!flowLogs) {
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    const accountBucket = accountBuckets[accountKey];
    if (!accountBucket) {
      console.warn(`Cannot find account bucket ${accountStack.accountKey}`);
      continue;
    }

    const vpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey,
      outputType: 'VpcOutput',
    });
    const vpcOutput = vpcOutputs.find(output => output.vpcName === vpcConfig.name);
    if (!vpcOutput) {
      console.warn(`Cannot find VPC "${vpcConfig.name}" to enable flow logs`);
      continue;
    }

    const flowLogContainer = getOrCreateFlowLogContainer({ accountBucket, accountStack });
    if (!flowLogContainer) {
      continue;
    }

    new ec2.CfnFlowLog(accountStack, `FlowLog${vpcConfig.name}`, {
      deliverLogsPermissionArn: flowLogContainer.role.roleArn,
      resourceId: vpcOutput.vpcId,
      resourceType: 'VPC',
      trafficType: ec2.FlowLogTrafficType.ALL,
      logDestination: flowLogContainer.destination,
      logDestinationType: ec2.FlowLogDestinationType.S3,
    });
  }
}

/**
 * Auxiliary method that gets or creates the flow log container in the given account stack.
 */
function getOrCreateFlowLogContainer(props: {
  accountBucket: s3.IBucket;
  accountStack: AccountStack;
}): FlowLogContainer | undefined {
  const { accountBucket, accountStack } = props;
  const flowLogContainer = accountStack.node.tryFindChild('FlowLogContainer');
  if (flowLogContainer) {
    return flowLogContainer as FlowLogContainer;
  }
  return new FlowLogContainer(accountStack, 'FlowLogContainer', {
    bucket: accountBucket,
  });
}
