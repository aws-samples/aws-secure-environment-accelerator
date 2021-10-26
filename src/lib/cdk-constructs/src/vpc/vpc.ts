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

export interface Subnet {
  id: string;
  name: string;
  az: string;
  cidrBlock: string;
}

export interface SecurityGroup {
  id: string;
  name: string;
}

export interface RouteTables {
  [key: string]: string;
}

export interface TgwAttachment {
  name: string;
  id: string;
}

export interface Vpc {
  id: string;
  name: string;
  region: string;

  cidrBlock: string;
  additionalCidrBlocks: string[];

  subnets: Subnet[];
  securityGroups: SecurityGroup[];

  tgwAttachments: TgwAttachment[];

  findSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet;
  tryFindSubnetByNameAndAvailabilityZone(name: string, az: string): Subnet | undefined;

  findSubnetIdsByName(name: string): string[];
  tryFindSubnetIdsByName(name: string): string[];

  findSecurityGroupByName(name: string): SecurityGroup;
  tryFindSecurityGroupByName(name: string): SecurityGroup | undefined;

  findRouteTableIdByName(name: string): string;
  tryFindRouteTableIdByName(name: string): string | undefined;
}
