import * as cdk from '@aws-cdk/core';
import { InterfaceEndpointConfig } from '@aws-pbmm/common-lambda/lib/config';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { loadStackOutputs } from '../utils/outputs';
import { AcceleratorStack } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { PeeringConnection } from '../common/peering-connection';
import { getAllAccountVPCConfigs } from '../common/get-all-vpcs';
import { getStackJsonOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { ResolversOutput } from './phase-2';
import { pascalCase } from 'pascal-case';
import { Route53ResolverRuleSharing } from '../common/r53-resolver-rule-sharing';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

type ResolversOutputs = ResolversOutput[];

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const app = new cdk.App();

  // Retrive all Account Configs
  const accountConfigs = getAllAccountVPCConfigs(acceleratorConfig);

  /**
   * Code to create Peering Connection Routes in all accounts
   */
  for (const [account, accountConfig] of Object.entries(accountConfigs)) {
    const vpcConfig = accountConfig.vpc!;
    const accountKey = vpcConfig.deploy === 'local' ? account : vpcConfig.deploy!;
    const currentRouteTable = vpcConfig['route-tables']?.find(x => x.routes?.find(y => y.target === 'pcx'));
    if (!currentRouteTable) {
      continue;
    }
    const pcxRouteDeployment = new AcceleratorStack(
      app,
      `PBMMAccel-PcxRouteDeployment${account}${vpcConfig.name}RoutesStack`,
      {
        env: {
          account: getAccountId(accounts, accountKey),
          region: cdk.Aws.REGION,
        },
        stackName: `PBMMAccel-PcxRouteDeployment${account}${vpcConfig.name.replace('_', '')}RoutesStack`,
        acceleratorName: context.acceleratorName,
        acceleratorPrefix: context.acceleratorPrefix,
      },
    );

    new PeeringConnection.PeeringConnectionRoutes(pcxRouteDeployment, `PcxRoutes${vpcConfig.name}`, {
      accountKey,
      vpcName: vpcConfig.name,
      vpcConfigs: accountConfigs,
      outputs,
    });
  }

  // to share the resolver rules
  // get the list of account IDs with which the resolver rules needs to be shared
  const sharedAccountIds: string[] = [];
  let hostedZonesAccountId: string = '';
  for (const [account, accountConfig] of Object.entries(accountConfigs)) {
    const vpcConfig = accountConfig.vpc!;
    const accountKey = vpcConfig.deploy === 'local' ? account : vpcConfig.deploy!;

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

  for (const [account, accountConfig] of Object.entries(accountConfigs)) {
    const vpcConfig = accountConfig.vpc!;
    const accountKey = vpcConfig.deploy === 'local' ? account : vpcConfig.deploy!;

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

      const r53ResolverRulesSharingStack = new AcceleratorStack(
        app,
        `PBMMAccel-Route53ResolverRulesSharing-${accountKey}Stack`,
        {
          env: {
            account: accountId,
            region: cdk.Aws.REGION,
          },
          acceleratorName: context.acceleratorName,
          acceleratorPrefix: context.acceleratorPrefix,
          stackName: `PBMMAccel-Route53ResolverRulesSharing-${pascalCase(accountKey)}Stack`,
        },
      );

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
