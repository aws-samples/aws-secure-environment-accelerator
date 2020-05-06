import { pascalCase } from 'pascal-case';
import * as cdk from '@aws-cdk/core';
import * as c from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc/vpc';
import { AvailabilityZone } from '@aws-pbmm/common-lambda/lib/config/types';
import { FortiGateCluster } from '@aws-pbmm/constructs/lib/fortinet/fortigate';
import { ImportedVpc } from './vpc';

export interface Step1Props {
  scope: cdk.Construct;
  vpc: Vpc;
  config: c.FirewallConfig;
}

export function step1(props: Step1Props) {
  const { scope, vpc, config } = props;

  const securityGroup = vpc.findSecurityGroupByName(config['security-group']);

  const cluster = new FortiGateCluster(scope, 'FortiGate', {
    vpcCidrBlock: vpc.cidrBlock,
    imageId: 'ami-047aac44951feb9fb', // TODO Use custom resource to find the AMI ID
    instanceType: config['instance-sizes'],
  });

  const azs = vpc.subnets.map(s => s.az);
  for (const az of new Set(azs)) {
    const instance = cluster.createInstance(`Fgt${pascalCase(az)}`);
    for (const port of config.eni.ports) {
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
}

async function main() {
  const app = new cdk.App();

  const stack = new cdk.Stack(app, 'Firewall', {
    env: {
      account: '422986242298',
    },
  });

  const vpc = ImportedVpc.fromOutput(app, 'Vpc', {
    vpcId: 'vpc-03982e444152ba98a',
    vpcName: 'Perimeter',
    cidrBlock: '100.96.250.0/23',
    subnets: [
      { subnetId: 'subnet-0eb2552554507e690', subnetName: 'Public', az: 'a', cidrBlock: '100.96.251.64/26' },
      { subnetId: 'subnet-0feeb1c41825981a4', subnetName: 'Public', az: 'b', cidrBlock: '100.96.251.128/26' },
      { subnetId: 'subnet-0ce7cc010d22c0cb2', subnetName: 'FWMgmt', az: 'a', cidrBlock: '100.96.251.16/28' },
      { subnetId: 'subnet-0136d537b11af7919', subnetName: 'FWMgmt', az: 'b', cidrBlock: '100.96.251.48/28' },
      { subnetId: 'subnet-0c52f609bc033b6fb', subnetName: 'Proxy', az: 'a', cidrBlock: '100.96.250.0/25' },
      { subnetId: 'subnet-08959bff24902e705', subnetName: 'Proxy', az: 'b', cidrBlock: '100.96.250.128/25' },
      { subnetId: 'subnet-0104b66d2a38a3104', subnetName: 'OnPremise', az: 'a', cidrBlock: '100.96.251.0/28' },
      { subnetId: 'subnet-08fc33b860caf7911', subnetName: 'OnPremise', az: 'b', cidrBlock: '100.96.251.32/28' },
    ],
    securityGroups: [
      { securityGroupId: 'sg-08d8378ab1c797008', securityGroupName: 'Perimeter-Prod-ALB' },
      { securityGroupId: 'sg-01ae42c1c16eb9b5f', securityGroupName: 'Perimeter-DevTest-ALB' },
      { securityGroupId: 'sg-0d60752ea8b4c613a', securityGroupName: 'FortigateMgr' },
      { securityGroupId: 'sg-026130949d3591838', securityGroupName: 'Fortigates' },
    ],
    routeTables: {},
  });

  step1({
    scope: stack,
    vpc,
    config: c.parse(c.FirewallConfigType, {
      'instance-sizes': 'c5n.2xlarge',
      image: 'https://aws.amazon.com/marketplace/pp/B00PCZSWDA?qid=1588624790695',
      version: '6.2.3',
      region: 'ca-central-1',
      'security-group': 'Fortigates',
      vpc: 'Perimeter',
      eni: {
        ports: [
          {
            subnet: 'Public',
            eip: true,
            'internal-ip-addresses': {
              a: '100.96.251.68/26',
              b: '100.96.251.132/26',
            },
          },
          {
            subnet: 'OnPremise',
            eip: false,
            'internal-ip-addresses': {
              a: '100.96.251.4/28',
              b: '100.96.251.36/28',
            },
          },
          {
            subnet: 'FWMgmt',
            eip: true,
            'internal-ip-addresses': {
              a: '100.96.251.20/28',
              b: '100.96.251.52/28',
            },
          },
          {
            subnet: 'Proxy',
            eip: false,
            'internal-ip-addresses': {
              a: '100.96.250.4/25',
              b: '100.96.250.132/25',
            },
          },
        ],
      },
    }),
  });
}

main();
