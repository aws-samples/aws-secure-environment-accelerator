import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { S3Template } from '@custom-resources/s3-template';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc';
import { FirewallCluster, FirewallInstance } from '@aws-pbmm/constructs/lib/firewall';
import { AccountStacks } from '../../../common/account-stacks';
import { StructuredOutput } from '../../../common/structured-output';
import {
  FirewallVpnConnectionOutputType,
  FirewallVpnConnection,
  FirewallInstanceOutput,
  FirewallInstanceOutputType,
} from './outputs';
import { createRoleName } from '@aws-pbmm/common-cdk/lib/core/accelerator-name-generator';

export interface FirewallStep3Props {
  accountStacks: AccountStacks;
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
  const { accountStacks, config, outputs, vpcs } = props;

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    const firewallConfig = accountConfig.deployments?.firewall;
    if (!firewallConfig) {
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
      throw new Error(`Cannot find firewall VPN connection outputs`);
    }

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    await createFirewallCluster({
      config,
      scope: accountStack,
      vpc,
      firewallConfig,
      firewallVpnConnections,
    });
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFirewallCluster(props: {
  config: c.AcceleratorConfig;
  scope: cdk.Construct;
  vpc: Vpc;
  firewallConfig: c.FirewallConfig;
  firewallVpnConnections: FirewallVpnConnection[];
}) {
  const { config, scope, vpc, firewallConfig, firewallVpnConnections } = props;

  const securityGroup = vpc.findSecurityGroupByName(firewallConfig['security-group']);

  // TODO Single bucket per account!
  // This is for testing
  const bucket = new s3.Bucket(scope, 'FirewallConfig');

  const centralBucketName = config['global-options']['central-bucket'];
  const centralBucket = s3.Bucket.fromBucketAttributes(scope, 'CentralBucket', {
    bucketName: centralBucketName,
  });

  // Use S3 template to copy over the license from the central bucket
  const copyLicense = new S3Template(scope, 'FirewallLicense', {
    templateBucket: centralBucket,
    templatePath: firewallConfig.license,
    outputBucket: bucket,
    outputPath: 'license.lic',
  });

  const cluster = new FirewallCluster(scope, 'Firewall', {
    vpcCidrBlock: vpc.cidrBlock,
    imageId: firewallConfig['image-id'],
    instanceType: firewallConfig['instance-sizes'],
    roleName: createRoleName('Firewall'),
    configuration: {
      bucket,
      bucketRegion: cdk.Aws.REGION,
      licensePath: 'license.lic',
      templateBucket: centralBucket,
      templateConfigPath: firewallConfig.config,
    },
  });
  // Make sure the license is copied before creating the cluster
  cluster.node.addDependency(copyLicense);

  // Make sure the cluster can read the license and write the configuration template
  bucket.grantRead(cluster.instanceRole);

  // We only need once firewall instance per availability zone
  const instancePerAz: { [az: string]: FirewallInstance } = {};

  for (const vpnConnection of firewallVpnConnections) {
    const az = vpnConnection.az;
    const subnetName = vpnConnection.subnetName;
    const subnet = vpc.findSubnetByNameAndAvailabilityZone(subnetName, az);

    let instance = instancePerAz[az];
    if (!instance) {
      const instanceName = `Fgt${pascalCase(az)}`;
      instance = cluster.createInstance(instanceName);
      instancePerAz[az] = instance;

      new StructuredOutput<FirewallInstanceOutput>(scope, `Fgt${pascalCase(az)}Output`, {
        type: FirewallInstanceOutputType,
        value: {
          id: instance.instanceId,
          name: instanceName,
          az,
        },
      });
    }

    instance.addNetworkInterface({
      name: vpnConnection.name,
      subnet,
      securityGroup,
      eipAllocationId: vpnConnection.eipAllocationId,
      vpnTunnelOptions: vpnConnection.vpnTunnelOptions,
    });
  }
  return cluster;
}
