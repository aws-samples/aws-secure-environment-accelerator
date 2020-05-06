import * as cdk from '@aws-cdk/core';
import * as config from '@aws-pbmm/common-lambda/lib/config';
import { Vpc } from '@aws-pbmm/constructs/lib/vpc/vpc';
import { FortiGateCluster } from '@aws-pbmm/constructs/lib/fortinet/fortigate';
import { ImportedVpc } from './vpc';

export interface Step1Props {
  scope: cdk.Construct;
  vpc: Vpc;
  config?: config.FirewallConfig;
}

export function step1(props: Step1Props) {
  const { scope, vpc } = props;

  new FortiGateCluster(scope, 'FortiGate', {
    vpc,
    securityGroupName: 'Fortigates',
    imageId: 'ami-099941e57393c2225',
    instanceType: 'c5.xlarge',
    ports: [
      {
        subnetName: 'Public',
        eip: true,
        ipAddresses: {
          a: '100.97.1.10/26',
          b: '100.97.1.74/26',
        },
      },
    ],
  });
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
    routeTables: {
      OnPremise_Shared: 'rtb-0c6bb555b2137bf74',
      Public_Shared: 'rtb-0cb95969600e21b3e',
      FWMgmt_azA: 'rtb-0e2f379ec0d1f6e65',
      FWMgmt_azB: 'rtb-09120f5d4453477e7',
      Proxy_azA: 'rtb-042dc32d17daf717a',
      Proxy_azB: 'rtb-068d3100b82f195cb',
    },
    securityGroups: [
      { securityGroupId: 'sg-08d8378ab1c797008', securityGroupName: 'Perimeter-Prod-ALB' },
      { securityGroupId: 'sg-01ae42c1c16eb9b5f', securityGroupName: 'Perimeter-DevTest-ALB' },
      { securityGroupId: 'sg-0d60752ea8b4c613a', securityGroupName: 'FortigateMgr' },
      { securityGroupId: 'sg-026130949d3591838', securityGroupName: 'Fortigates' },
    ],
  });

  step1({
    scope: stack,
    vpc,
  });
}

main();
