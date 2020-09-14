import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { ResourceCleanup } from '@aws-accelerator/custom-resource-cleanup';
import { ResourceCleanupOutputFinder } from './outputs';

export interface Route53CleanupProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
}

/**
 *
 *  Deletes Route53 private hosted zones and resolver rules and its associations
 *
 */
export async function step2(props: Route53CleanupProps) {
  const { accountStacks, config, outputs } = props;

  // Finding the output for previous resource cleanup execution
  const resourceCleanupOutput = ResourceCleanupOutputFinder.tryFindOneByName({
    outputs,
    bucketPolicyCleanup: true,
  });

  // Checking if cleanup got executed in any of the previous SM runs
  if (resourceCleanupOutput) {
    console.warn(`Executed cleanup custom resource in the previous SM execution, skip calling cleanup custom resource`);
    return;
  }

  // TODO change based on latest config
  // const centralZonesAccount = config['global-options'].zones.account;
  const centralZonesDomain = config['global-options'].zones.names.private;

  // TODO get MAD domains

  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    const resolverRuleDomains: string[] = [];
    const privateHostedZones: string[] = [];

    if (!vpcConfig.resolvers) {
      continue;
    }

    const rulesDomain = vpcConfig['on-premise-rules']?.map(r => r.zone) || [];
    resolverRuleDomains.push(...(rulesDomain as string[]));

    resolverRuleDomains.push(...centralZonesDomain);
    privateHostedZones.push(...centralZonesDomain);

    const cleanupRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'ResourceCleanupRole',
    });
    if (!cleanupRoleOutput) {
      console.warn(`Cannot find Cleanup custom resource Roles output for account ${accountKey}`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    console.log('resolverRuleDomains', accountKey, resolverRuleDomains);
    console.log('privateHostedZones', accountKey, privateHostedZones);
    new ResourceCleanup(accountStack, `Route53Cleanup${accountKey}`, {
      rulesDomainNames: resolverRuleDomains,
      phzDomainNames: privateHostedZones,
      roleArn: cleanupRoleOutput.roleArn,
    });
  }
}
