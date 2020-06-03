import * as cdk from '@aws-cdk/core';
import { ResolversOutput } from '@aws-pbmm/common-outputs/lib/stack-output';
import { getAccountId } from '../utils/accounts';
import { pascalCase } from 'pascal-case';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { InterfaceEndpointConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Route53ResolverRuleSharing } from '../common/r53-resolver-rule-sharing';
import { PhaseInput } from './shared';

type ResolversOutputs = ResolversOutput[];

export interface RdgwArtifactsOutput {
  accountKey: string;
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

export async function deploy({ acceleratorConfig, accounts, accountStacks, outputs }: PhaseInput) {
  // to share the resolver rules
  // get the list of account IDs with which the resolver rules needs to be shared
  const vpcConfigs = acceleratorConfig.getVpcConfigs();
  const sharedAccountIds: string[] = [];
  let hostedZonesAccountId: string | undefined;
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    if (InterfaceEndpointConfig.is(vpcConfig['interface-endpoints'])) {
      hostedZonesAccountId = getAccountId(accounts, accountKey);
    }

    if (vpcConfig['use-central-endpoints']) {
      const accountId = getAccountId(accounts, accountKey);
      if (accountId && hostedZonesAccountId && accountId !== hostedZonesAccountId) {
        sharedAccountIds.push(accountId);
      }
    }
  }

  for (const { accountKey, vpcConfig } of vpcConfigs) {
    const resolverRuleArns: string[] = [];
    if (vpcConfig.resolvers) {
      const accountId = getAccountId(accounts, accountKey);

      const resolversOutputs: ResolversOutputs[] = getStackJsonOutput(outputs, {
        accountKey,
        outputType: 'GlobalOptionsOutput',
      });

      for (const resolversOutput of resolversOutputs) {
        const resolverOutput = resolversOutput.find(x => x.vpcName === vpcConfig.name);
        if (!resolverOutput) {
          console.warn(
            `No Resolver Rules found in outputs for account key ${accountKey} and VPC name ${vpcConfig.name}`,
          );
          continue;
        }

        resolverRuleArns.push(
          `arn:aws:route53resolver:${cdk.Aws.REGION}:${accountId}:resolver-rule/${resolverOutput.rules?.inBoundRule!}`,
        );
        resolverOutput.rules?.onPremRules?.map(x =>
          resolverRuleArns.push(`arn:aws:route53resolver:${cdk.Aws.REGION}:${accountId}:resolver-rule/${x}`),
        );
      }

      const r53ResolverRulesSharingStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
      if (!r53ResolverRulesSharingStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }

      const route53ResolverRuleSharing = new Route53ResolverRuleSharing(
        r53ResolverRulesSharingStack,
        `ShareResolverRulesStack-${pascalCase(accountKey)}`,
        {
          name: 'PBMMAccel-Route53ResolverRulesSharing',
          allowExternalPrincipals: false,
          principals: sharedAccountIds,
          resourceArns: resolverRuleArns,
        },
      );
    }
  }
}
