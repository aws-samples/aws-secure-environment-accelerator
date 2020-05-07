import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc/vpc';
import { AvailabilityZone } from '@aws-pbmm/common-lambda/lib/config/types';
import { FortiGateCluster } from '@aws-pbmm/constructs/lib/fortinet/fortigate';
import { ImageFinder } from '@aws-pbmm/constructs/lib/fortinet/image-finder';
import { StackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { Output as CustomResourcesOutput } from '../custom-resources/step-1';
import { AccountStacks } from '../../common/account-stacks';

export interface Props {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  vpcs: Vpc[];
}

/**
 * Creates the firewall clusters for the accounts that define a firewall deployment.
 */
export async function create(props: Props) {
  const { accountStacks, config, outputs, vpcs } = props;

  // We need the image finder custom resource
  const customResourcesOutput = CustomResourcesOutput.findInStackOutputs(outputs);

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

    const accountStack = accountStacks.getOrCreateAccountStack(accountKey);
    await createFortiGateCluster({
      scope: accountStack,
      vpc,
      firewallConfig,
      imageFinderFuncArn: customResourcesOutput.imageFinderFuncArn,
    });
  }
}

/**
 * Create firewall for the given VPC and config in the given scope.
 */
async function createFortiGateCluster(props: {
  scope: cdk.Construct;
  vpc: Vpc;
  firewallConfig: c.FirewallConfig;
  imageFinderFuncArn: string;
}) {
  const { scope, vpc, firewallConfig, imageFinderFuncArn } = props;

  const securityGroup = vpc.findSecurityGroupByName(firewallConfig['security-group']);

  // If Bring-Your-Own-License, then use the AWS build, otherwise the AWSONDEMAND build
  const imageOwner = '679593333241'; // FortiGate owner
  const imageName = firewallConfig.image === 'BYOL' ? 'FortiGate-VM64-AWS build*' : 'FortiGate-VM64-AWSONDEMAND build*';

  const imageFinder = new ImageFinder(scope, 'ImageFinder', {
    functionArn: imageFinderFuncArn,
    imageOwner,
    imageName,
    imageVersion: `*(${firewallConfig.version})*`,
  });

  const cluster = new FortiGateCluster(scope, 'FortiGate', {
    vpcCidrBlock: vpc.cidrBlock,
    imageId: imageFinder.imageId,
    instanceType: firewallConfig['instance-sizes'],
  });

  const azs = vpc.subnets.map(s => s.az);
  for (const az of new Set(azs)) {
    // Create one firewall instance in every availability zone
    const instance = cluster.createInstance(`Fgt${pascalCase(az)}`);

    for (const port of firewallConfig.eni.ports) {
      const subnet = vpc.findSubnetByNameAndAvailabilityZone(port.subnet, az);
      const ipCidr = port['internal-ip-addresses'][az as AvailabilityZone];
      if (!ipCidr) {
        throw new Error(`Cannot find IP CIDR for firewall port for subnet "${port.subnet}"`);
      }

      instance.addPort({
        subnet,
        securityGroup,
        ipCidr: ipCidr.toCidrString(),
        attachEip: port.eip,
      });
    }
  }
  return cluster;
}
