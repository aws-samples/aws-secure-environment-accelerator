import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import { getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { pascalCase } from 'pascal-case';
import { loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { FlowLogContainer } from '../common/flow-log-bucket-stack';
import { VpcProps, VpcStack } from '../common/vpc';
import { JsonOutputValue } from '../common/json-output';
import { TransitGateway } from '../common/transit-gateway';
import { loadLimits, Limiter, Limit } from '../utils/limits';
import * as outputKeys from '@aws-pbmm/common-outputs/lib/stack-output';
import { NestedStack } from '@aws-cdk/aws-cloudformation';
import { InterfaceEndpointConfig, ResolvedVpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { InterfaceEndpoint } from '../common/interface-endpoints';
import { VpcOutput } from '../deployments/vpc';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { AccountStacks } from '../common/account-stacks';
import * as firewall from '../deployments/firewall';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

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

  const flowLogContainers: { [accountKey: string]: FlowLogContainer } = {};

  const accountStacks = new AccountStacks(app, {
    phase: 1,
    accounts,
    context,
  });

  // Auxiliary method to create a VPC stack the account with given account key
  // Only one VPC stack per account is created
  const getFlowLogContainer = (accountKey: string): FlowLogContainer => {
    if (flowLogContainers[accountKey]) {
      return flowLogContainers[accountKey];
    }

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
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
  const createVpc = (accountKey: string, props: VpcProps): Vpc | undefined => {
    const { vpcConfig } = props;

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
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
        } else if (!limiter.create(accountKey, Limit.VpcInterfaceEndpointsPerVpc, vpc.name)) {
          console.log(
            `Skipping endpoint "${endpoint}" creation in VPC "${vpc.name}". Reached maximum interface endpoints per VPC`,
          );
          continue;
        }

        if (!endpointStack || endpointCount >= 30) {
          endpointStack = new NestedStack(accountStack, `Endpoint${endpointStackIndex++}`);
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
      const flowLogBucket = flowLogContainer.bucket;
      const flowLogRole = flowLogContainer.role;

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
      cidrBlock: props.vpcConfig.cidr.toCidrString(),
      subnets: vpc.azSubnets.subnets.map(s => ({
        subnetId: s.subnet.ref,
        subnetName: s.subnetName,
        az: s.az,
        cidrBlock: s.cidrBlock,
      })),
      routeTables: vpc.routeTableNameToIdMap,
      securityGroups: Object.entries(vpc.securityGroup?.securityGroupNameMapping || {}).map(
        ([name, securityGroup]) => ({
          securityGroupId: securityGroup.ref,
          securityGroupName: name,
        }),
      ),
    };

    // Store the VPC output so that subsequent phases can access the output
    new JsonOutputValue(vpc, `VpcOutput`, {
      type: 'VpcOutput',
      value: vpcOutput,
    });

    return vpcStack.vpc;
  };

  // Create all the VPCs for accounts and organizational units
  const vpcs = [];
  for (const { ouKey, accountKey, vpcConfig, deployments } of acceleratorConfig.getVpcConfigs()) {
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
    const accountVpcConfigs = acceleratorConfig.getVpcConfigs().filter(x => x.accountKey === accountKey);
    const vpc = createVpc(accountKey, {
      accountKey,
      limiter,
      accounts,
      vpcConfig,
      tgwDeployment: deployments?.tgw,
      organizationalUnitName: ouKey,
      accountVpcConfigs,
    });
    if (vpc) {
      vpcs.push(vpc);
    }
  }

  // Create the firewall
  await firewall.step2({
    accountStacks,
    config: acceleratorConfig,
    outputs,
    transitGateways,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
