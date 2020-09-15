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
  // const centralVpcZoneConfig = config['global-options'].zones.find(zc => zc.names);
  // const centralZonesDomain: string[] = [];
  // if (centralVpcZoneConfig) {
  //   centralZonesDomain.push(...(centralVpcZoneConfig.names?.private || []));
  // }
  // const madConfigs = config.getMadConfigs();
  // const madDomains = madConfigs.map(m => m.mad['dns-domain']);
  
  const centralZonesDomain: string[] = config['global-options'].zones.names.private;

  for (const { accountKey, vpcConfig } of config.getVpcConfigs()) {
    const resolverRuleDomains: string[] = [];
    const privateHostedZones: string[] = [];

    if (!vpcConfig.resolvers) {
      continue;
    }

    const rulesDomain: string[] = vpcConfig['on-premise-rules']?.map(r => r.zone) || [];
    // TODO Add MAD Domains also here
    resolverRuleDomains.push(...rulesDomain);

    resolverRuleDomains.push(...centralZonesDomain);
    privateHostedZones.push(...centralZonesDomain.map(z => `${z}.`));

    const cleanupRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'ResourceCleanupRole',
    });
    if (!cleanupRoleOutput) {
      console.warn(`Cannot find Cleanup custom resource Roles output for account ${accountKey}`);
      continue;
    }

    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, vpcConfig.region);
    if (!accountStack) {
      console.warn(`Cannot find account stack ${accountKey}`);
      continue;
    }

    console.log('resolverRuleDomains', accountKey, resolverRuleDomains);
    console.log('privateHostedZones', accountKey, privateHostedZones);
    new ResourceCleanup(accountStack, `Route53Cleanup${accountKey}-${vpcConfig.name}-${vpcConfig.region}`, {
      rulesDomainNames: resolverRuleDomains,
      phzDomainNames: privateHostedZones,
      roleArn: cleanupRoleOutput.roleArn,
    });
  }
}
