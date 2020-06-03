import * as cdk from '@aws-cdk/core';
import { Vpc, SecurityGroup, Subnet } from '@aws-pbmm/constructs/lib/vpc';
import { VpcOutput } from '@aws-pbmm/common-outputs/lib/stack-output';

export { VpcOutput, SecurityGroupsOutput } from '@aws-pbmm/common-outputs/lib/stack-output';

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

  findSubnetIdsByName(name: string): string[] {
    const subnets = this.tryFindSubnetIdsByName(name);
    if (subnets.length === 0) {
      throw new Error(`Cannot find subnet with name "${name}"`);
    }
    return subnets;
  }

  tryFindSubnetIdsByName(name: string): string[] {
    return this.subnets.filter(s => s.name === name).map(s => s.id);
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
      securityGroups: (output.securityGroups || []).map(sg => ({
        id: sg.securityGroupId,
        name: sg.securityGroupName,
      })),
    });
  }
}
