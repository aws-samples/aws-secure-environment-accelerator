import * as cdk from '@aws-cdk/core';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { pascalCase } from 'pascal-case';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { InterfaceEndpointConfig } from '@aws-pbmm/common-lambda/lib/config';
import { ResolversOutput } from './phase-2';
import { Route53ResolverRuleSharing } from '../common/r53-resolver-rule-sharing';
import { AccountStacks } from '../common/account-stacks';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

type ResolversOutputs = ResolversOutput[];

export interface RdgwArtifactsOutput {
  accountKey: string;
  bucketArn: string;
  bucketName: string;
  keyPrefix: string;
}

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const app = new cdk.App();

  const accountStacks = new AccountStacks(app, {
    phase: 4,
    accounts,
    context,
  });

  // to share the resolver rules
  // get the list of account IDs with which the resolver rules needs to be shared
  const vpcConfigs = acceleratorConfig.getVpcConfigs();
  const sharedAccountIds: string[] = [];
  let hostedZonesAccountId: string = '';
  for (const { accountKey, vpcConfig } of vpcConfigs) {
    if (InterfaceEndpointConfig.is(vpcConfig['interface-endpoints'])) {
      hostedZonesAccountId = getAccountId(accounts, accountKey);
    }

    if (vpcConfig['use-central-endpoints']) {
      const accountId = getAccountId(accounts, accountKey);
      if (accountId !== hostedZonesAccountId) {
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
          throw new Error(
            `No Resolver Rules found in outputs for account key ${accountKey} and VPC name ${vpcConfig.name}`,
          );
        }

        resolverRuleArns.push(
          `arn:aws:route53resolver:${cdk.Aws.REGION}:${accountId}:resolver-rule/${resolverOutput.rules?.inBoundRule!}`,
        );
        resolverOutput.rules?.onPremRules?.map(x =>
          resolverRuleArns.push(`arn:aws:route53resolver:${cdk.Aws.REGION}:${accountId}:resolver-rule/${x}`),
        );
      }

      const r53ResolverRulesSharingStack = accountStacks.getOrCreateAccountStack(accountKey);

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

// tslint:disable-next-line: no-floating-promises
main();
