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

export interface AssignedCidrPool {
  'account-ou-key': string;
  cidr: string;
  id: string;
  region: string;
  requester: string;
  status: string;
  'vpc-assigned-id'?: number;
  'account-Key'?: string;
  'account-id'?: string;
  'vpc-id'?: string;
}

export interface AssignedVpcCidrPool extends AssignedCidrPool {
  'vpc-name': string;
  pool: string;
}

export interface AssignedSubnetCidrPool extends AssignedCidrPool {
  'vpc-name': string;
  'subnet-name': string;
  az: string;
  'sub-pool': string;
  'subnet-id'?: string;
}

export interface CidrPool {
  id: string;
  cidr: string;
  region: string;
  pool: string;
}

export function getVpcCidrPools(
  vpcPools: AssignedVpcCidrPool[],
  accountKey: string,
  region: string,
  vpcName: string,
  organizationalUnitName?: string,
): AssignedVpcCidrPool[] {
  let filteredPools = vpcPools.filter(
    vpcPool => vpcPool['account-Key'] === accountKey && vpcPool['vpc-name'] === vpcName && vpcPool.region === region,
  );
  if (filteredPools.length === 0) {
    filteredPools = vpcPools.filter(
      vpcPool =>
        vpcPool['account-ou-key'] === `account/${accountKey}` &&
        vpcPool['vpc-name'] === vpcName &&
        vpcPool.region === region,
    );
  }
  if (filteredPools.length === 0 && organizationalUnitName) {
    filteredPools = vpcPools.filter(
      vpcPool =>
        vpcPool['account-ou-key'] === `organizational-unit/${organizationalUnitName}` &&
        vpcPool['vpc-name'] === vpcName &&
        vpcPool.region === region,
    );
  }
  return filteredPools;
}

export function getSubnetCidrPools(props: {
  subnetPools: AssignedSubnetCidrPool[];
  accountKey: string;
  region: string;
  vpcName: string;
  subnetName?: string;
  az?: string;
  organizationalUnitName?: string;
}): AssignedSubnetCidrPool[] {
  const { accountKey, region, subnetPools, vpcName, az, organizationalUnitName, subnetName } = props;
  let filteredPools = subnetPools.filter(
    subnetPool =>
      subnetPool['account-Key'] === accountKey &&
      subnetPool['vpc-name'] === vpcName &&
      subnetPool.region === region &&
      ((subnetName && subnetPool['subnet-name'] === subnetName) || !subnetName) &&
      ((az && subnetPool.az === az) || !az),
  );
  if (filteredPools.length === 0) {
    filteredPools = subnetPools.filter(
      subnetPool =>
        subnetPool['account-ou-key'] === `account/${accountKey}` &&
        subnetPool['vpc-name'] === vpcName &&
        subnetPool.region === region &&
        ((subnetName && subnetPool['subnet-name'] === subnetName) || !subnetName) &&
        ((az && subnetPool.az === az) || !az),
    );
  }
  if (filteredPools.length === 0 && organizationalUnitName) {
    filteredPools = subnetPools.filter(
      subnetPool =>
        subnetPool['account-ou-key'] === `organizational-unit/${organizationalUnitName}` &&
        subnetPool['vpc-name'] === vpcName &&
        subnetPool.region === region &&
        ((subnetName && subnetPool['subnet-name'] === subnetName) || !subnetName) &&
        ((az && subnetPool.az === az) || !az),
    );
  }
  return filteredPools;
}
