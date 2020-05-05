import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ram from '@aws-cdk/aws-ram';
import * as config from '@aws-pbmm/common-lambda/lib/config';
import { getAccountId, Account } from '@aws-pbmm/common-outputs/lib/accounts';
import { pascalCase } from 'pascal-case';
import { VpcCommonProps, AzSubnets } from './vpc';
import { AddTagsToResourcesOutput } from './add-tags-to-resources-output';

export interface VpcSubnetSharingProps extends VpcCommonProps {
  subnets: AzSubnets;
}

export function getSharedAccounts(
  accounts: Account[],
  shareToOuAccounts?: boolean,
  specificAccounts?: string[],
  organizationalUnitName?: string,
): string[] {
  // Share to accounts with a specific name
  const shareToAccounts = specificAccounts || [];
  const shareToAccountIds = shareToAccounts.map((accountKey: string) => getAccountId(accounts, accountKey));

  // Share to accounts in this OU
  if (shareToOuAccounts) {
    if (!organizationalUnitName) {
      throw new Error(`Cannot share subnet with OU accounts because the subnet is not in a OU`);
    }

    const ouAccounts = accounts.filter(a => a.ou === organizationalUnitName);
    const ouAccountIds = ouAccounts.map(a => getAccountId(accounts, a.key));
    shareToAccountIds.push(...ouAccountIds);
  }
  return shareToAccountIds;
}

export function getVpcSharedAccounts(
  accounts: Account[],
  vpcConfig: config.VpcConfig,
  organizationalUnitName?: string,
): string[] {
  const shareToAccountsIds: string[] = [];
  const subnets = vpcConfig.subnets;
  for (const subnet of subnets || []) {
    const subnetShareAccounts = getSharedAccounts(
      accounts,
      subnet['share-to-ou-accounts'],
      subnet['share-to-specific-accounts'] || [],
      organizationalUnitName,
    );
    shareToAccountsIds.push(...subnetShareAccounts);
  }
  return shareToAccountsIds;
}

/**
 * Auxiliary construct that takes care of VPC subnet sharing.
 */
export class VpcSubnetSharing extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: VpcSubnetSharingProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const { context, vpcConfig, subnets: vpcSubnets, organizationalUnitName } = props;
    const { accounts } = context;

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
        throw new Error(`Cannot find subnet with name "${subnet.name}" in VPC`);
      }

      // Share to accounts with a specific name
      const shareToAccountIds = getSharedAccounts(
        accounts,
        subnet['share-to-ou-accounts'],
        subnet['share-to-specific-accounts'] || [],
        organizationalUnitName,
      );

      if (shareToAccountIds.length > 0) {
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
      new AddTagsToResourcesOutput(this, 'OutputSharedResources', {
        dependencies: sharedSubnets.map(o => o.subnet),
        produceResources: () =>
          sharedSubnets.map(o => ({
            resourceId: o.subnet.ref,
            resourceType: 'subnet',
            sourceAccountId: o.sourceAccountId,
            targetAccountIds: o.targetAccountIds,
            tags: o.subnet.tags.renderTags(),
          })),
      });
    }
  }
}
