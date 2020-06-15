import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { InstanceProfile } from '@aws-pbmm/constructs/lib/iam';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput, getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { FirewallCluster, FirewallInstance } from '@aws-pbmm/constructs/lib/firewall';
import { AccountStacks, AccountStack } from '../../../common/account-stacks';
import { StructuredOutput } from '../../../common/structured-output';
import {
  FirewallVpnConnectionOutputType,
  FirewallVpnConnection,
  FirewallInstanceOutput,
  FirewallInstanceOutputType,
} from './outputs';
import { OUTPUT_SUBSCRIPTION_REQUIRED } from '@aws-pbmm/common-outputs/lib/stack-output';
import { checkAccountWarming } from '../../account-warming/outputs';
import { createIamInstanceProfileName } from '../../../common/iam-assets';

export interface FirewallStep3Props {
  accountBuckets: { [accountKey: string]: s3.IBucket };
  accountStacks: AccountStacks;
  centralBucket: s3.IBucket;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  vpcs: Vpc[];
}

/**
 * Creates the firewall clusters using the EIPs and customer gateways from previous steps.
 *
 * The following outputs are necessary from previous steps:
 *   - Firewall ports with optional VPN connections from step 2 of the firewall deployment
 *   - VPC with the name equals firewallConfig.vpc and with the necessary subnets and security group
 */
export async function step3(props: FirewallStep3Props) {
  const { accountBuckets, accountStacks, centralBucket, config, outputs, vpcs } = props;
  const vpcConfigs = config.getVpcConfigs();

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const firewallConfig = accountConfig.deployments?.firewall;
    if (!firewallConfig) {
      continue;
    }

    if (accountConfig['account-warming-required'] && !checkAccountWarming(accountKey, outputs)) {
      console.log(`Skipping firewall deployment: account "${accountKey}" is not warmed`);
      continue;
    }

    const subscriptionOutputs = getStackJsonOutput(outputs, {
      outputType: 'AmiSubscriptionStatus',
      accountKey,
    });
    const subscriptionStatus = subscriptionOutputs.find(sub => sub.imageId === firewallConfig['image-id']);
    if (subscriptionStatus && subscriptionStatus.status === OUTPUT_SUBSCRIPTION_REQUIRED) {
      console.log(`AMI Marketplace subscription required for ImageId: ${firewallConfig['image-id']}`);
      continue;
    }

    const vpcConfig = vpcConfigs.find(v => v.vpcConfig.name === firewallConfig.vpc)?.vpcConfig;
    if (!vpcConfig) {
      console.log(`Skipping firewall deployment because of missing VPC config "${firewallConfig.vpc}"`);
      continue;
    }

    const vpc = vpcs.find(v => v.name === firewallConfig.vpc);
    if (!vpc) {
      console.log(`Skipping firewall deployment because of missing VPC "${firewallConfig.vpc}"`);
      continue;
    }

    const tgwAttach = firewallConfig['tgw-attach'];
    const tgwAccountKey = tgwAttach.account;

    // Find the firewall VPN connections in the TGW account
    const firewallVpnConnectionOutputs = StructuredOutput.fromOutputs(outputs, {
      type: FirewallVpnConnectionOutputType,
      accountKey: tgwAccountKey,
    });
    const firewallVpnConnections = firewallVpnConnectionOutputs
      .flatMap(array => array)
      .filter(conn => conn.firewallAccountKey === accountKey);
    if (firewallVpnConnections.length === 0) {
      console.warn(`Cannot find firewall VPN connection outputs`);
      continue;
    }

    const accountBucket = accountBuckets[accountKey];
    if (!accountBucket) {
      throw new Error(`Cannot find default account bucket for account ${accountKey}`);
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountStack}`);
      continue;
    }

    await createFirewallCluster({
      accountBucket,
      accountStack,
      centralBucket,
      firewallConfig,
      firewallVpnConnections,
      vpc,
      vpcConfig,
    });
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFirewallCluster(props: {
  accountBucket: s3.IBucket;
  accountStack: AccountStack;
  centralBucket: s3.IBucket;
  firewallConfig: c.FirewallConfig;
  firewallVpnConnections: FirewallVpnConnection[];
  vpc: Vpc;
  vpcConfig: c.VpcConfig;
}) {
  const { accountStack, accountBucket, centralBucket, firewallConfig, firewallVpnConnections, vpc, vpcConfig } = props;

  const {
    name: firewallName,
    config: configFile,
    license: licenseFiles,
    'security-group': securityGroupName,
    'fw-instance-role': instanceRoleName,
    'image-id': imageId,
    'instance-sizes': instanceType,
  } = firewallConfig;

  const securityGroup = vpc.tryFindSecurityGroupByName(securityGroupName);
  if (!securityGroup) {
    console.warn(`Cannot find security group with name "${securityGroupName}" in VPC "${vpc.name}"`);
    return;
  }

  // Import role from a previous phase
  const instanceRoleArn = `arn:aws:iam::${accountStack.accountId}:role/${instanceRoleName}`;
  const instanceRole = iam.Role.fromRoleArn(accountStack, 'FirewallRole', instanceRoleArn, {
    mutable: true,
  });

  // Import instance profile from a previous phase
  const instanceProfile = InstanceProfile.fromInstanceRoleName(accountStack, 'FirewallInstanceProfile', {
    instanceProfileName: createIamInstanceProfileName(instanceRoleName),
  });

  // TODO Condition to check if `firewallConfig.license` and `firewallConfig.config` exist

  const cluster = new FirewallCluster(accountStack, 'Firewall', {
    vpcCidrBlock: vpc.cidrBlock,
    imageId,
    instanceType,
    instanceRole,
    instanceProfile,
    configuration: {
      bucket: accountBucket,
      bucketRegion: cdk.Aws.REGION,
      templateBucket: centralBucket,
      templateConfigPath: configFile,
    },
  });

  // We only need once firewall instance per availability zone
  const instancePerAz: { [az: string]: FirewallInstance } = {};
  let licenseIndex: number = 0;

  for (const vpnConnection of firewallVpnConnections) {
    const az = vpnConnection.az;
    const subnetName = vpnConnection.subnetName;
    const subnet = vpc.tryFindSubnetByNameAndAvailabilityZone(subnetName, az);

    if (!subnet || !securityGroup) {
      console.warn(`Cannot find subnet with name "${subnetName}" in availability zone "${az}"`);
      continue;
    }

    let instance = instancePerAz[az];
    let licensePath: string | undefined;
    let licenseBucket: s3.IBucket | undefined;
    if (!instance) {
      // Find the next available license in the firewall config license list
      if (licenseFiles && licenseIndex < licenseFiles.length) {
        licensePath = licenseFiles[licenseIndex];
        licenseBucket = centralBucket;
      }

      // Create an instance for this AZ
      const instanceName = `${firewallName}_az${pascalCase(az)}`;
      instance = cluster.createInstance({
        name: instanceName,
        hostname: instanceName,
        licensePath,
        licenseBucket,
      });
      instancePerAz[az] = instance;
      licenseIndex++;

      new StructuredOutput<FirewallInstanceOutput>(accountStack, `Fgt${pascalCase(az)}Output`, {
        type: FirewallInstanceOutputType,
        value: {
          id: instance.instanceId,
          name: firewallName,
          az,
        },
      });
    }

    const networkInterface = instance.addNetworkInterface({
      name: vpnConnection.name,
      subnet,
      securityGroup,
      eipAllocationId: vpnConnection.eipAllocationId,
      vpnTunnelOptions: vpnConnection.vpnTunnelOptions,
    });

    const routeTables = vpcConfig['route-tables'] || [];
    for (const routeTable of routeTables) {
      const routeTableName: string = routeTable.name;
      const routes = routeTable.routes || [];
      for (const route of routes) {
        if (
          route.target !== 'firewall' ||
          route.name !== firewallName ||
          route.az !== az ||
          route.port !== vpnConnection.name
        ) {
          continue;
        }

        const routeTableId = vpc.tryFindRouteTableIdByName(routeTableName);
        if (!routeTableId) {
          console.warn(`Cannot find route table with name "${routeTableName}" in VPC ${vpc.name}`);
          continue;
        }
        new ec2.CfnRoute(accountStack, `${routeTableName}_eni_${vpnConnection.name}_${az}`, {
          routeTableId,
          destinationCidrBlock: route.destination as string,
          networkInterfaceId: networkInterface.ref,
        });
      }
    }
  }
  return cluster;
}
