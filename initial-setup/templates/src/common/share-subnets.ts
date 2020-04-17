import * as cdk from '@aws-cdk/core';
import { getAccountId } from '../utils/accounts';
import { VpcSharing } from './vpc-sharing';
import { StackOutputs, getStackOutput } from '../utils/outputs';
import { OrganizationalUnit } from '@aws-pbmm/common-lambda/lib/config';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';

export namespace ShareVpc {
  export interface StackProps extends AcceleratorStackProps {
    stackOutputs: StackOutputs;
    organizationalUnit: OrganizationalUnit;
    accounts: { key: string; id: string }[];
  }

  export class Stack extends AcceleratorStack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);
      const vpcName = props.organizationalUnit.vpc.name;
      const orgAccountName = props.organizationalUnit.vpc.deploy!;
      const region = props.organizationalUnit.vpc.region;
      const sourceAccountId = getAccountId(props.accounts, orgAccountName);

      props.organizationalUnit.vpc.subnets?.forEach(subnetConfig => {
        if (subnetConfig['share-to-specific-accounts']!.length > 0) {
          let accountIndex: number = 0;
          const accountIds: string[] = [];
          const accountNames = subnetConfig['share-to-specific-accounts'];
          for (const accountName of accountNames!) {
            const accountId = getAccountId(props.accounts, accountName);
            if (accountId) {
              accountIds[accountIndex] = accountId;
              accountIndex++;
            }
          }
          if (sourceAccountId) {
            for (const [key, subnetDefinition] of subnetConfig.definitions.entries()) {
              if (subnetDefinition.disabled) {
                continue;
              }
              const subnetIdStackOut = getStackOutput(
                props.stackOutputs,
                orgAccountName,
                `${props.organizationalUnit.vpc.name}Subnet${subnetConfig.name}az${key + 1}`,
              );
              new VpcSharing(this, `${vpcName}_${subnetConfig.name}_${key + 1}`, {
                subnetId: subnetIdStackOut,
                sourceAccountId,
                targetAccountIds: accountIds,
                region: region!,
              });
            }
          }
        }
      });
    }
  }
}
