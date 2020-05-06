import * as cdk from '@aws-cdk/core';
import { Vpc, SecurityGroup, Subnet } from '@aws-pbmm/constructs/lib/vpc/vpc';

export interface VpcSubnetOutput {
  subnetId: string;
  subnetName: string;
  az: string;
  cidrBlock: string;
}

export interface VpcSecurityGroupOutput {
  securityGroupId: string;
  securityGroupName: string;
}

export interface VpcOutput {
  vpcId: string;
  vpcName: string;
  cidrBlock: string;
  subnets: VpcSubnetOutput[];
  routeTables: { [key: string]: string };
  securityGroups: VpcSecurityGroupOutput[];
  pcx?: string;
}

export interface ImportedVpcProps {
  readonly id: string;
  readonly name: string;

  readonly cidrBlock: string;
  readonly additionalCidrBlocks: string[];

  readonly subnets: Subnet[];
  readonly securityGroups: SecurityGroup[];
}

export class ImportedVpc extends cdk.Construct implements Vpc {
  readonly props: ImportedVpcProps;

  constructor(scope: cdk.Construct, id: string, props: ImportedVpcProps) {
    super(scope, id);
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get cidrBlock(): string {
    return this.props.cidrBlock;
  }

  get additionalCidrBlocks(): string[] {
    return this.props.additionalCidrBlocks;
  }

  get subnets(): Subnet[] {
    return this.props.subnets;
  }

  get securityGroups(): SecurityGroup[] {
    return this.props.securityGroups;
  }

  findSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet {
    const subnet = this.tryFindSubnetByNameAndAvailabilityZone(name, az);
    if (!subnet) {
      throw new Error(`Cannot find subnet "${name}" in AZ "${az}" in VPC "${this.name}"`);
    }
    return subnet;
  }

  tryFindSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet | undefined {
    return this.subnets.find(s => s.name === name && s.az === az);
  }

  findSecurityGroupByName(name: string): SecurityGroup {
    const securityGroup = this.tryFindSecurityGroupByName(name);
    if (!securityGroup) {
      throw new Error(`Cannot find security group "${name}" in VPC "${this.name}"`);
    }
    return securityGroup;
  }

  tryFindSecurityGroupByName(name: string): SecurityGroup | undefined {
    return this.securityGroups.find(sg => sg.name === name);
  }

  static fromOutput(scope: cdk.Construct, id: string, output: VpcOutput) {
    return new ImportedVpc(scope, id, {
      id: output.vpcId,
      name: output.vpcName,
      cidrBlock: output.cidrBlock,
      additionalCidrBlocks: [],
      subnets: output.subnets.map(s => ({
        id: s.subnetId,
        name: s.subnetName,
        az: s.az,
        cidrBlock: s.cidrBlock,
      })),
      securityGroups: output.securityGroups.map(sg => ({
        id: sg.securityGroupId,
        name: sg.securityGroupName,
      })),
    });
  }
}
