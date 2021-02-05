import * as c from '@aws-accelerator/common-config/src';
import { AccountStacks } from '../../common/account-stacks';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { IamRoleOutputFinder } from '@aws-accelerator/common-outputs/src/iam-role';
import { ResourceCleanup } from '@aws-accelerator/custom-resource-cleanup';
import { ResourceStackCleanupOutputFinder } from './outputs';
import { Context } from '../../utils/context';
import * as sv from 'semver';

export interface CdkStackCleanupProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
  outputs: StackOutput[];
  context: Context;
}

/**
 *
 *  Deletes Route53 private hosted zones and resolver rules and its associations
 *
 */
export async function step3(props: CdkStackCleanupProps) {
  const { accountStacks, config, outputs, context } = props;

  const installerVersion = context.installerVersion;
  // TODO verify the version and update it accordingly
  const isCleanupRequired = sv.clean(installerVersion) === null ? true : sv.lt(installerVersion, '1.2.6');
  if (!isCleanupRequired) {
    return;
  }

  // Finding the output for previous resource cleanup execution
  const resourceCleanupOutput = ResourceStackCleanupOutputFinder.tryFindOneByName({
    outputs,
    cdkStackCleanup: true,
  });

  // Checking if cleanup got executed in any of the previous SM runs
  if (resourceCleanupOutput) {
    console.warn(`Skipping Execution, CdkToolKit stack cleanup has been executed earlier`);
    return;
  }

  const masterOrgKey = config.getMandatoryAccountKey('master');
  const regions = config['global-options']['supported-regions'];

  for (const [accountKey, _] of config.getAccountConfigs()) {
    // TODO remove the below condition
    if (accountKey === masterOrgKey) {
      continue;
    }

    const cleanupRoleOutput = IamRoleOutputFinder.tryFindOneByName({
      outputs,
      accountKey,
      roleKey: 'ResourceCleanupRole',
    });
    if (!cleanupRoleOutput) {
      console.warn(`Cannot find Cleanup custom resource Roles output for account ${accountKey}`);
      continue;
    }

    for (const region of regions) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }

      new ResourceCleanup(accountStack, `CdkStackCleanup${accountKey}-${region}`, {
        roleArn: cleanupRoleOutput.roleArn,
        cdkStackName: 'CDKToolkit',
      });
    }
  }
}
