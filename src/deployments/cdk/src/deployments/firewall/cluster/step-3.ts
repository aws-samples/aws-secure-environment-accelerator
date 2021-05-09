import { pascalCase } from 'pascal-case';
import * as s3 from '@aws-cdk/aws-s3';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import { Vpc } from '@aws-accelerator/cdk-constructs/src/vpc';
import { InstanceProfile } from '@aws-accelerator/cdk-constructs/src/iam';
import * as c from '@aws-accelerator/common-config/src';
import {
  StackOutput,
  getStackJsonOutput,
  OUTPUT_SUBSCRIPTION_REQUIRED,
} from '@aws-accelerator/common-outputs/src/stack-output';
import { FirewallCluster, FirewallInstance } from '@aws-accelerator/cdk-constructs/src/firewall';
import { AccountStacks, AccountStack } from '../../../common/account-stacks';
import {
  FirewallVpnConnection,
  CfnFirewallInstanceOutput,
  FirewallVpnConnectionOutputFinder,
  CfnFirewallConfigReplacementsOutput,
} from './outputs';
import { checkAccountWarming } from '../../account-warming/outputs';
import { createIamInstanceProfileName } from '../../../common/iam-assets';
import { RegionalBucket } from '../../defaults';
import { string as StringType } from 'io-ts';

export interface FirewallStep3Props {
  accountBuckets: { [accountKey: string]: RegionalBucket };
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
  const replacementsConfig = config.replacements;
  const replacements = additionalReplacements(replacementsConfig);

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const firewallConfigs = accountConfig.deployments?.firewalls;
    if (!firewallConfigs || firewallConfigs.length === 0) {
      continue;
    }

    if (accountConfig['account-warming-required'] && !checkAccountWarming(accountKey, outputs)) {
      console.log(`Skipping firewall deployment: account "${accountKey}" is not warmed`);
      continue;
    }

    const accountBucket = accountBuckets[accountKey];
    if (!accountBucket) {
      throw new Error(`Cannot find default account bucket for account ${accountKey}`);
    }

    const subscriptionOutputs = getStackJsonOutput(outputs, {
      outputType: 'AmiSubscriptionStatus',
      accountKey,
    });

    for (const firewallConfig of firewallConfigs.filter(firewall => c.FirewallEC2ConfigType.is(firewall))) {
      if (!c.FirewallEC2ConfigType.is(firewallConfig)) {
        continue;
      }
      const attachConfig = firewallConfig['tgw-attach'];
      if (!c.TransitGatewayAttachConfigType.is(attachConfig)) {
        continue;
      }

      const subscriptionStatus = subscriptionOutputs.find(sub => sub.imageId === firewallConfig['image-id']);
      if (subscriptionStatus && subscriptionStatus.status === OUTPUT_SUBSCRIPTION_REQUIRED) {
        console.log(`AMI Marketplace subscription required for ImageId: ${firewallConfig['image-id']}`);
        continue;
      }

      // TODO add region check also if vpc name is not unique accross Account
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

      // Find the firewall VPN connections in the TGW account
      const firewallVpnConnectionOutputs = FirewallVpnConnectionOutputFinder.findAll({
        outputs,
        accountKey: attachConfig.account,
        region: firewallConfig.region,
      });
      const firewallVpnConnections = firewallVpnConnectionOutputs
        .flatMap(array => array)
        .filter(conn => conn.firewallAccountKey === accountKey && conn.firewallName === firewallConfig.name);
      if (firewallVpnConnections.length === 0) {
        console.warn(`Cannot find firewall VPN connection outputs`);
        continue;
      }

      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, firewallConfig.region);
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
        replacements,
      });
    }
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFirewallCluster(props: {
  accountBucket: RegionalBucket;
  accountStack: AccountStack;
  centralBucket: s3.IBucket;
  firewallConfig: c.FirewallEC2ConfigType;
  firewallVpnConnections: FirewallVpnConnection[];
  vpc: Vpc;
  vpcConfig: c.VpcConfig;
  replacements?: { [key: string]: string };
}) {
  const {
    accountStack,
    accountBucket,
    centralBucket,
    firewallConfig,
    firewallVpnConnections,
    vpc,
    vpcConfig,
    replacements,
  } = props;

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
  const instanceRole = iam.Role.fromRoleArn(accountStack, `FirewallRole${firewallName}`, instanceRoleArn, {
    mutable: true,
  });

  // Import instance profile from a previous phase
  const instanceProfile = InstanceProfile.fromInstanceRoleName(accountStack, `FirewallInstanceProfile${firewallName}`, {
    instanceProfileName: createIamInstanceProfileName(instanceRoleName),
  });

  // TODO Condition to check if `firewallConfig.license` and `firewallConfig.config` exist

  const cluster = new FirewallCluster(accountStack, `Firewall${firewallName}`, {
    vpcCidrBlock: vpc.cidrBlock,
    additionalCidrBlocks: vpc.additionalCidrBlocks,
    imageId,
    instanceType,
    instanceRole,
    instanceProfile,
    configuration: {
      bucket: accountBucket,
      bucketRegion: accountBucket.region,
      templateBucket: centralBucket,
      templateConfigPath: configFile,
    },
  });

  // Make sure the instance can read the configuration
  accountBucket.grantRead(instanceRole);

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

      new CfnFirewallInstanceOutput(accountStack, `Fgt${firewallName}${pascalCase(az)}Output`, {
        id: instance.instanceId,
        name: firewallName,
        az,
      });
    }

    const networkInterface = instance.addNetworkInterface({
      name: vpnConnection.name,
      subnet,
      securityGroup,
      eipAllocationId: vpnConnection.eipAllocationId,
      vpnTunnelOptions: vpnConnection.vpnTunnelOptions,
      additionalReplacements: replacements,
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
        new ec2.CfnRoute(accountStack, `${firewallName}${routeTableName}_eni_${vpnConnection.name}_${az}`, {
          routeTableId,
          destinationCidrBlock: route.destination as string,
          networkInterfaceId: networkInterface.ref,
        });
      }
    }
  }

  for (const instance of Object.values(instancePerAz)) {
    const replacements: { [key: string]: string } = {};
    Object.entries(instance.replacements).forEach(([key, value]) => {
      replacements[key.replace(/[^-a-zA-Z0-9_.]+/gi, '')] = value;
    });
    new CfnFirewallConfigReplacementsOutput(accountStack, `FirewallReplacementOutput${instance.instanceName}`, {
      instanceId: instance.instanceId,
      instanceName: instance.instanceName,
      name: firewallConfig.name,
      replacements,
    });
  }
  return cluster;
}

export function additionalReplacements(configReplacements: c.ReplacementsConfig): { [key: string]: string } {
  const replacements: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(configReplacements)) {
    if (!c.ReplacementConfigValueType.is(value)) {
      if (StringType.is(value)) {
        replacements['${' + key.toUpperCase() + '}'] = value;
      }
    } else {
      for (const [needle, replacement] of Object.entries(value)) {
        if (StringType.is(replacement)) {
          replacements['${' + key.toUpperCase() + '_' + needle.toUpperCase() + '}'] = replacement;
        }
      }
    }
  }
  return replacements;
}
