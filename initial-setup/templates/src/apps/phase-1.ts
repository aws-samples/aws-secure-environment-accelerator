import * as cdk from '@aws-cdk/core';
import { getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { pascalCase } from 'pascal-case';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { FlowLogBucketStack } from '../common/flow-log-bucket-stack';
import { Vpc, VpcProps } from '../common/vpc';
import { JsonOutputValue } from '../common/json-output';
import { TransitGateway } from '../common/transit-gateway';
import { TransitGatewayAttachment } from '../common/transit-gateway-attachment';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { FlowLog } from '../common/flow-log';
import { loadLimits, Limiter, Limit } from '../utils/limits';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

export interface VpcSubnetOutput {
  subnetId: string;
  subnetName: string;
  az: string;
}

export interface VpcOutput {
  vpcId: string;
  vpcName: string;
  subnets: VpcSubnetOutput[];
  routeTables: { [key: string]: string };
  pcx?: string;
}

/**
 * This is the main entry point to deploy phase 1.
 *
 * The following resources are deployed in phase 1:
 *   - Vpc
 *   - Subnets
 *   - Subnet sharing (RAM)
 *   - Route tables
 *   - Transit gateways
 *   - Internet gateways
 *   - NAT gateways
 *   - Interface endpoints
 *   - Gateway endpoints
 *   - Flow logs
 */
async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();
  const limits = await loadLimits();
  const limiter = new Limiter(limits);

  const globalOptions = acceleratorConfig['global-options'];

  const logArchiveAccountId = getStackOutput(outputs, 'log-archive', outputKeys.OUTPUT_LOG_ARCHIVE_ACCOUNT_ID);
  const logArchiveS3BucketArn = getStackOutput(outputs, 'log-archive', outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_ARN);
  const logArchiveS3KmsKeyArn = getStackOutput(
    outputs,
    'log-archive',
    outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN,
  );

  const app = new cdk.App();

  const transitGateways = new Map<string, TransitGateway>();
  const flowLogBucketStacks: { [accountKey: string]: FlowLogBucketStack } = {};

  // Auxiliary method to create a VPC stack the account with given account key
  // Only one VPC stack per account is created
  const getFlowLogsStack = (accountKey: string): FlowLogBucketStack => {
    const accountId = getAccountId(accounts, accountKey);
    if (flowLogBucketStacks[accountId]) {
      return flowLogBucketStacks[accountId];
    }

    const accountPrettyName = pascalCase(accountKey);
    const vpcStack = new FlowLogBucketStack(app, `FlowLogsStack${accountPrettyName}`, {
      env: {
        account: accountId,
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-${accountPrettyName}FlowLogs`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
      flowLogBucket: {
        expirationInDays: globalOptions['central-log-retention'],
        replication: {
          accountId: logArchiveAccountId,
          bucketArn: logArchiveS3BucketArn,
          kmsKeyArn: logArchiveS3KmsKeyArn,
        },
      },
    });
    flowLogBucketStacks[accountId] = vpcStack;
    return vpcStack;
  };

  // Auxiliary method to create a VPC in the account with given account key
  const createVpc = (accountKey: string, props: VpcProps) => {
    const { vpcConfig } = props;

    const accountPrettyName = pascalCase(accountKey);
    const vpcStackPrettyName = pascalCase(props.vpcConfig.name);
    const vpcStack = new AcceleratorStack(app, `VpcStack${vpcStackPrettyName}`, {
      env: {
        account: getAccountId(accounts, accountKey),
        region: cdk.Aws.REGION,
      },
      stackName: `PBMMAccel-${accountPrettyName}Vpc${vpcStackPrettyName}`,
      acceleratorName: context.acceleratorName,
      acceleratorPrefix: context.acceleratorPrefix,
    });

    // Create the VPC
    const vpc = new Vpc(vpcStack, props.vpcConfig.name, props);

    // Enable flow logging if necessary
    const flowLogs = vpcConfig['flow-logs'];
    if (flowLogs) {
      const flowLogsStack = getFlowLogsStack(accountKey);
      const flowLogBucket = flowLogsStack.getOrCreateFlowLogBucket();

      new FlowLog(vpcStack, 'FlowLogs', {
        vpcId: vpc.vpcId,
        bucketArn: flowLogBucket.bucketArn,
      });
    }

    // Prepare the output for next phases
    const vpcOutput: VpcOutput = {
      vpcId: vpc.vpcId,
      vpcName: props.vpcConfig.name,
      subnets: vpc.azSubnets.subnets.map(s => ({
        subnetId: s.subnet.ref,
        subnetName: s.subnetName,
        az: s.az,
      })),
      routeTables: vpc.routeTableNameToIdMap,
    };

    // Store the VPC output so that subsequent phases can access the output
    new JsonOutputValue(vpc, `VpcOutput`, {
      type: 'VpcOutput',
      value: vpcOutput,
    });

    const tgwDeployment = props.tgwDeployment;
    if (tgwDeployment) {
      const tgw = new TransitGateway(vpcStack, tgwDeployment.name!, tgwDeployment);
      transitGateways.set(tgwDeployment.name!, tgw);
    }

    const tgwAttach = props.vpcConfig['tgw-attach'];
    if (tgwAttach) {
      const tgwName = tgwAttach['associate-to-tgw'];
      const tgw = transitGateways.get(tgwName);
      if (tgw && tgwName.length > 0) {
        const attachSubnetsConfig = tgwAttach['attach-subnets'] || [];
        const associateConfig = tgwAttach['tgw-rt-associate'] || [];
        const propagateConfig = tgwAttach['tgw-rt-propagate'] || [];

        const subnetIds = attachSubnetsConfig.flatMap(
          subnet => vpc.azSubnets.getAzSubnetIdsForSubnetName(subnet) || [],
        );
        const tgwRouteAssociates = associateConfig.map(route => tgw.getRouteTableIdByName(route)!);
        const tgwRoutePropagates = propagateConfig.map(route => tgw.getRouteTableIdByName(route)!);

        // Attach VPC To TGW
        new TransitGatewayAttachment(vpcStack, 'TgwAttach', {
          vpcId: vpc.vpcId,
          subnetIds,
          transitGatewayId: tgw.tgwId,
          tgwRouteAssociates,
          tgwRoutePropagates,
        });
      }
    }
  };

  // Create all the VPCs for accounts and organizational units
  for (const { ouKey, accountKey, vpcConfig } of acceleratorConfig.getVpcConfigs()) {
    if (!limiter.create(accountKey, Limit.VpcPerRegion)) {
      console.log(
        `Skipping VPC "${vpcConfig.name}" deployment. Reached maximum VPCs per region for account "${accountKey}"`,
      );
      continue;
    }

    console.debug(
      `Deploying VPC "${vpcConfig.name}" in account "${accountKey}"${
        ouKey ? ` and organizational unit "${ouKey}"` : ''
      }`,
    );
    createVpc(accountKey, {
      accountKey,
      limiter,
      accounts,
      vpcConfig,
      organizationalUnitName: ouKey,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();
