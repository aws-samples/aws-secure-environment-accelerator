/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { Vpc, SecurityGroup, Subnet, RouteTables, TgwAttachment } from '@aws-accelerator/cdk-constructs/src/vpc';
import { VpcOutput } from '@aws-accelerator/common-outputs/src/vpc';
import { createCfnStructuredOutput } from '../../common/structured-output';

export const S3_DESTINATION_TYPE = 'S3';
export const CWL_DESTINATION_TYPE = 'CWL';
export const BOTH_DESTINATION_TYPE = 'BOTH';
export const NONE_DESTINATION_TYPE = 'NONE';

export const CfnVpcOutput = createCfnStructuredOutput(VpcOutput);

export interface ImportedVpcProps {
  readonly id: string;
  readonly name: string;
  readonly region: string;

  readonly cidrBlock: string;
  readonly additionalCidrBlocks: string[];

  readonly subnets: Subnet[];
  readonly securityGroups: SecurityGroup[];

  readonly routeTables: RouteTables;

  readonly tgwAttachments: TgwAttachment[];
}

export class ImportedVpc implements Vpc {
  readonly id = this.props.id;
  readonly name = this.props.name;
  readonly region = this.props.region;
  readonly cidrBlock = this.props.cidrBlock;
  readonly additionalCidrBlocks = this.props.additionalCidrBlocks;
  readonly subnets = this.props.subnets;
  readonly securityGroups = this.props.securityGroups;
  readonly routeTables = this.props.routeTables;
  readonly tgwAttachments = this.props.tgwAttachments;

  constructor(private readonly props: ImportedVpcProps) {}

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

  findRouteTableIdByName(name: string): string {
    const routeTable = this.tryFindRouteTableIdByName(name);
    if (!routeTable) {
      throw new Error(`Cannot find route table with name "${name}" in VPC "${this.name}"`);
    }
    return routeTable;
  }

  tryFindRouteTableIdByName(name: string): string | undefined {
    return this.routeTables[name];
  }

  static fromOutput(output: VpcOutput) {
    return new ImportedVpc({
      id: output.vpcId,
      name: output.vpcName,
      region: output.region,
      cidrBlock: output.cidrBlock,
      additionalCidrBlocks: output.additionalCidrBlocks,
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
      routeTables: output.routeTables,
      tgwAttachments: output.tgwAttachments,
    });
  }
}
