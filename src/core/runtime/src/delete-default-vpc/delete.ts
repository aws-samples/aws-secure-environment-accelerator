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

import { EC2 } from '@aws-accelerator/common/src/aws/ec2';
import { LoadConfigurationInput } from '../load-configuration-step';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { equalIgnoreCase } from '@aws-accelerator/common/src/util/common';

interface DeleteVPCInput extends LoadConfigurationInput {
  accountId: string;
  assumeRoleName: string;
}

const CustomErrorMessage = [
  {
    code: 'AuthFailure',
    message: 'Region Not Enabled',
  },
  {
    code: 'OptInRequired',
    message: 'Region not Opted-in',
  },
];

const sts = new STS();
const organizations = new Organizations();
export const handler = async (input: DeleteVPCInput): Promise<string[]> => {
  console.log(`Deleting Default VPC in account ...`);
  console.log(JSON.stringify(input, null, 2));
  const { accountId, assumeRoleName, configRepositoryName, configFilePath, configCommitId } = input;

  // Retrieve Configuration from Code Commit with specific commitId
  const acceleratorConfig = await loadAcceleratorConfig({
    repositoryName: configRepositoryName,
    filePath: configFilePath,
    commitId: configCommitId,
  });
  const awsAccount = await organizations.getAccount(accountId);
  if (!awsAccount) {
    // This will never happen unless it is called explicitly with invalid AccountId
    throw new Error(`Unable to retrieve account info from Organizations API for "${accountId}"`);
  }
  let excludeWorkloadRegions: string[] | undefined;
  const accountConfig = acceleratorConfig
    .getWorkloadAccountConfigs()
    .find(([_, a]) => equalIgnoreCase(a.email, awsAccount.Email!));
  if (accountConfig) {
    excludeWorkloadRegions = accountConfig[1]['keep-default-vpc-regions'];
  }
  const supportedRegions = acceleratorConfig['global-options']['supported-regions'];
  const excludeRegions = acceleratorConfig['global-options']['keep-default-vpc-regions'];
  const regions = supportedRegions
    .filter(r => !excludeRegions.includes(r))
    .filter(w => !`${excludeWorkloadRegions || []}`.includes(w));
  console.log(`${accountId}: Excluding Deletion of  Default VPC for regions from account "${accountId}"...`);
  console.log(`${accountId}: ${JSON.stringify(excludeRegions.concat(`${excludeWorkloadRegions || []}`), null, 2)}`);
  const errors: string[] = [];
  const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
  for (const region of regions) {
    console.log(`Deleting Default vpc in ${region}`);
    try {
      const ec2 = new EC2(credentials, region);
      const defaultVpcs = await ec2.describeDefaultVpcs();
      if (!defaultVpcs || defaultVpcs.length === 0) {
        continue;
      }
      for (const vpc of defaultVpcs) {
        const deleteErrors = await deleteVpc(ec2, vpc.VpcId!, accountId, region);
        errors.push(...deleteErrors);
      }
    } catch (error) {
      errors.push(
        `${accountId}:${region}: ${error.code}: ${
          CustomErrorMessage.find(cm => cm.code === error.code)?.message || error.message
        }`,
      );
      continue;
    }
  }

  console.log(`${accountId}: Errors `, JSON.stringify(errors, null, 2));
  return errors;
};

async function deleteVpc(ec2: EC2, vpcId: string, accountId: string, region: string): Promise<string[]> {
  const errors: string[] = [];
  // List all Subnets to delete
  const subnets = await ec2.listSubnets({
    Filters: [
      {
        Name: 'vpc-id',
        Values: [vpcId],
      },
    ],
  });
  // Deleting Subnets
  for (const subnet of subnets) {
    try {
      await ec2.deleteSubnet(subnet.SubnetId!);
    } catch (error) {
      errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
    }
  }

  // Detach VPC From Internet Gateway
  const igws = await ec2.describeInternetGatewaysByVpc([vpcId]);
  for (const igw of igws || []) {
    try {
      await ec2.detachInternetGateway(vpcId, igw.InternetGatewayId!);
      await ec2.deleteInternetGateway(igw.InternetGatewayId!);
    } catch (error) {
      errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
    }
  }
  // Deleting VPC
  try {
    await ec2.deleteVpc(vpcId);
  } catch (error) {
    errors.push(`${accountId}:${region}: ${error.code}: ${error.message}`);
  }
  return errors;
}
