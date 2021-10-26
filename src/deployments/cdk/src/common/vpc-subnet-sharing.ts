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

import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ram from '@aws-cdk/aws-ram';
import { pascalCase } from 'pascal-case';
import { getAccountId, Account } from '../utils/accounts';
import { VpcCommonProps, AzSubnets } from './vpc';
import { AddTagsToResourcesOutput } from './add-tags-to-resources-output';
import * as config from '@aws-accelerator/common-config/src';

export interface VpcSubnetSharingProps extends VpcCommonProps {
  subnets: AzSubnets;
  vpc: ec2.CfnVPC;
}

export function getSharedAccountKeys(
  accounts: Account[],
  shareToOuAccounts: boolean,
  specificAccounts: string[],
  organizationalUnitName?: string,
): string[] | undefined {
  // Share to accounts with a specific name
  const shareToAccountKeys = [...specificAccounts];

  // Share to accounts in this OU
  if (shareToOuAccounts) {
    if (!organizationalUnitName) {
      console.warn(`Cannot share subnet with OU accounts because the subnet is not in a OU`);
      return;
    }

    const ouAccounts = accounts.filter(a => a.ou === organizationalUnitName);
    const ouAccountKeys = ouAccounts.map(a => a.key);
    shareToAccountKeys.push(...ouAccountKeys);
  }
  return shareToAccountKeys;
}

export function getVpcSharedAccountKeys(
  accounts: Account[],
  vpcConfig: config.VpcConfig,
  organizationalUnitName?: string,
): string[] {
  const shareToAccountsKeys: string[] = [];
  const subnets = vpcConfig.subnets;
  for (const subnet of subnets || []) {
    const subnetShareAccountKeys = getSharedAccountKeys(
      accounts,
      subnet['share-to-ou-accounts'],
      subnet['share-to-specific-accounts'] || [],
      organizationalUnitName,
    );

    if (subnetShareAccountKeys) {
      shareToAccountsKeys.push(...subnetShareAccountKeys);
    }
  }
  return shareToAccountsKeys;
}

/**
 * Auxiliary construct that takes care of VPC subnet sharing.
 */
export class VpcSubnetSharing extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: VpcSubnetSharingProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const { accounts, vpcConfig, subnets: vpcSubnets, organizationalUnitName, vpc } = props;

    // Keep track of what has been shared and put it in the output
    const sharedSubnets: {
      subnet: ec2.CfnSubnet;
      sourceAccountId: string;
      targetAccountIds: string[];
    }[] = [];

    const subnets = vpcConfig.subnets || [];
    for (const subnet of subnets) {
      const azSubnets = vpcSubnets.getAzSubnetsForSubnetName(subnet.name);
      if (azSubnets.length === 0) {
        console.warn(`Cannot find subnet with name "${subnet.name}" in VPC`);
        continue;
      }

      // Share to accounts with a specific name
      const shareToAccountKeys = getSharedAccountKeys(
        accounts,
        subnet['share-to-ou-accounts'],
        subnet['share-to-specific-accounts'] || [],
        organizationalUnitName,
      );

      if (shareToAccountKeys && shareToAccountKeys.length > 0) {
        const shareToAccountIds = shareToAccountKeys.map(accountKey => getAccountId(accounts, accountKey)!);
        const shareName = `${pascalCase(vpcConfig.name)}-${pascalCase(subnet.name)}`;

        // Share the subnets
        new ram.CfnResourceShare(this, `Share-${shareName}`, {
          name: shareName,
          allowExternalPrincipals: false,
          principals: shareToAccountIds,
          resourceArns: azSubnets.map(s => `arn:aws:ec2:${vpcConfig.region}:${stack.account}:subnet/${s.subnet.ref}`),
        });

        // Add the subnets to the VPC sharing output
        for (const azSubnet of azSubnets) {
          sharedSubnets.push({
            subnet: azSubnet.subnet,
            sourceAccountId: stack.account,
            targetAccountIds: shareToAccountIds,
          });
        }
      }
    }

    // Output the shared resources and their tags so that the `add-tags-to-shared-resources-step` step in the state
    // machine will add the tags to the shared resources.
    if (sharedSubnets.length > 0) {
      new AddTagsToResourcesOutput(this, 'OutputSharedResourcesSubnets', {
        dependencies: sharedSubnets.map(o => o.subnet),
        produceResources: () =>
          sharedSubnets.map(o => ({
            resourceId: o.subnet.ref,
            resourceType: 'subnet',
            sourceAccountId: o.sourceAccountId,
            targetAccountIds: o.targetAccountIds,
            tags: o.subnet.tags.renderTags(),
            region: cdk.Aws.REGION,
          })),
      });

      new AddTagsToResourcesOutput(this, 'OutputSharedResourcesVPC', {
        dependencies: [vpc],
        produceResources: () =>
          sharedSubnets.map(o => ({
            resourceId: vpc.ref,
            resourceType: 'vpc',
            sourceAccountId: o.sourceAccountId,
            targetAccountIds: o.targetAccountIds,
            tags: vpc.tags.renderTags(),
            region: cdk.Aws.REGION,
          })),
      });
    }
  }
}
