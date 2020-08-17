import * as c from '@aws-accelerator/common-config/src';
import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';
import { createRoleName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnIamRoleOutput } from './outputs';

export interface IamConfigServiceRoleProps {
  acceleratorPrefix: string;
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

export async function createConfigServiceRoles(props: IamConfigServiceRoleProps): Promise<void> {
  const { accountStacks, config, acceleratorPrefix } = props;
  const accountKeys = config.getAccountConfigs().map(([accountKey, _]) => accountKey);

  for (const accountKey of accountKeys) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.error(`Not able to create stack for "${accountKey}"`);
      continue;
    }

    // Creating role for Config Recorder
    const configRecorderRole = new iam.Role(accountStack, `IAM-ConfigRecorderRole-${accountKey}`, {
      roleName: createRoleName(`ConfigRecorderRole`),
      description: `${acceleratorPrefix} Config Recorder Role`,
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRole')],
    });

    new CfnIamRoleOutput(accountStack, `ConfigRecorderRoleOutput`, {
      roleName: configRecorderRole.roleName,
      roleArn: configRecorderRole.roleArn,
      roleKey: 'ConfigRecorderRole',
    });
  }

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  // Creating role for Config Organization Aggregator
  const configAggregatorRole = new iam.Role(masterAccountStack, `IAM-ConfigAggregatorRole-${masterAccountKey}`, {
    roleName: createRoleName(`ConfigAggregatorRole`),
    description: `${acceleratorPrefix} Config Aggregator Role`,
    assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
    managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRoleForOrganizations')],
  });

  new CfnIamRoleOutput(masterAccountStack, `ConfigAggregatorRoleOutput`, {
    roleName: configAggregatorRole.roleName,
    roleArn: configAggregatorRole.roleArn,
    roleKey: 'ConfigAggregatorRole',
  });
}
