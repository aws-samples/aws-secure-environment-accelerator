import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { getStackOutput } from '@aws-pbmm/common-outputs/lib/outputs';
import { Limit } from '@aws-pbmm/common-outputs/lib/limits';
import { pascalCase } from 'pascal-case';
import { FlowLogContainer } from '../common/flow-log-bucket-stack';
import { AcceleratorStack } from '../common/accelerator-stack';
import { VpcProps, VpcStack } from '../common/vpc';
import { JsonOutputValue } from '../common/json-output';
import { TransitGateway } from '../common/transit-gateway';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { NestedStack } from '@aws-cdk/aws-cloudformation';
import { InterfaceEndpointConfig } from '@aws-pbmm/common-lambda/lib/config';
import { InterfaceEndpoint } from '../common/interface-endpoints';
import { Context } from '../utils/context';

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
  const context = await Context.load();

  const globalOptions = context.config['global-options'];

  const logArchiveAccountId = getStackOutput(context.outputs, 'log-archive', outputKeys.OUTPUT_LOG_ARCHIVE_ACCOUNT_ID);
  const logArchiveS3BucketArn = getStackOutput(
    context.outputs,
    'log-archive',
    outputKeys.OUTPUT_LOG_ARCHIVE_BUCKET_ARN,
  );
  const logArchiveS3KmsKeyArn = getStackOutput(
    context.outputs,
    'log-archive',
    outputKeys.OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN,
  );

  const app = new cdk.App();

  const transitGateways = new Map<string, TransitGateway>();

  const accountStacks: { [accountKey: string]: AcceleratorStack } = {};
  const flowLogContainers: { [accountKey: string]: FlowLogContainer } = {};

  // Auxiliary method to create a VPC stack the account with given account key
  // Only one VPC stack per account is created
  const getAccountStack = (accountKey: string): AcceleratorStack => {
    if (accountStacks[accountKey]) {
      return accountStacks[accountKey];
    }

    const account = context.accounts.getAccountByKey(accountKey);
    const accountPrettyName = pascalCase(accountKey);
    const accountStack = new AcceleratorStack(app, `${accountPrettyName}Phase1`, {
      stackName: `PBMMAccel-${accountPrettyName}-Phase1`,
      context,
      account,
    });
    accountStacks[accountKey] = accountStack;
    return accountStack;
  };

  // Auxiliary method to create a VPC stack the account with given account key
  // Only one VPC stack per account is created
  const getFlowLogContainer = (accountKey: string): FlowLogContainer => {
    if (flowLogContainers[accountKey]) {
      return flowLogContainers[accountKey];
    }

    const accountStack = getAccountStack(accountKey);
    const flowLogContainer = new FlowLogContainer(accountStack, `FlowLogContainer`, {
      expirationInDays: globalOptions['central-log-retention'],
      replication: {
        accountId: logArchiveAccountId,
        bucketArn: logArchiveS3BucketArn,
        kmsKeyArn: logArchiveS3KmsKeyArn,
      },
    });
    flowLogContainers[accountKey] = flowLogContainer;
    return flowLogContainer;
  };

  // Auxiliary method to create a VPC in the account with given account key
  const createVpc = (accountKey: string, props: VpcProps) => {
    const { vpcConfig } = props;

    const accountStack = getAccountStack(accountKey);
    const vpcStackPrettyName = pascalCase(props.vpcConfig.name);

    const vpcStack = new VpcStack(accountStack, `VpcStack${vpcStackPrettyName}`, {
      vpcProps: props,
      transitGateways,
    });
    const vpc = vpcStack.vpc;

    const endpointConfig = vpcConfig['interface-endpoints'];
    if (InterfaceEndpointConfig.is(endpointConfig)) {
      const subnetName = endpointConfig.subnet;
      const subnetIds = vpc.azSubnets.getAzSubnetIdsForSubnetName(subnetName);
      if (!subnetIds) {
        throw new Error(`Cannot find subnet ID with name "${subnetName}'`);
      }

      let endpointCount = 0;
      let endpointStackIndex = 0;
      let endpointStack;
      for (const endpoint of endpointConfig.endpoints) {
        if (endpoint === 'notebook') {
          console.log(`Skipping endpoint "${endpoint}" creation in VPC "${vpc.name}". Endpoint not supported`);
          continue;
        } else if (!context.limiter.create(accountKey, Limit.VpcInterfaceEndpointsPerVpc, vpc.name)) {
          console.log(
            `Skipping endpoint "${endpoint}" creation in VPC "${vpc.name}". Reached maximum interface endpoints per VPC`,
          );
          continue;
        }

        if (!endpointStack || endpointCount >= 30) {
          endpointStack = new NestedStack(accountStack, `Endpoint${endpointStackIndex++}`);
          endpointStack.addDependency(vpcStack);
          endpointCount = 0;
        }
        new InterfaceEndpoint(endpointStack, pascalCase(endpoint), {
          serviceName: endpoint,
          vpcId: vpc.vpcId,
          vpcRegion: vpc.region,
          subnetIds,
        });
        endpointCount++;
      }
    }

    // Enable flow logging if necessary
    const flowLogs = vpcConfig['flow-logs'];
    if (flowLogs) {
      const flowLogContainer = getFlowLogContainer(accountKey);
      const flowLogBucket = flowLogContainer.getOrCreateFlowLogBucket();
      const flowLogRole = flowLogContainer.getOrCreateFlowLogRole();

      new ec2.CfnFlowLog(vpcStack, 'FlowLog', {
        deliverLogsPermissionArn: flowLogRole.roleArn,
        resourceId: vpc.vpcId,
        resourceType: 'VPC',
        trafficType: ec2.FlowLogTrafficType.ALL,
        logDestination: `${flowLogBucket.bucketArn}/flowlogs`,
        logDestinationType: ec2.FlowLogDestinationType.S3,
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
  };

  // Create all the VPCs for accounts and organizational units
  for (const { ouKey, accountKey, vpcConfig, deployments } of context.config.getVpcConfigs()) {
    const account = context.accounts.getAccountByKey(accountKey);
    if (!context.limiter.create(accountKey, Limit.VpcPerRegion)) {
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
      context,
      account,
      vpcConfig,
      tgwDeployment: deployments?.tgw,
      organizationalUnitName: ouKey,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();
