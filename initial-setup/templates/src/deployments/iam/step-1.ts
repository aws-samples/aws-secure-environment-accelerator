import * as c from '@aws-pbmm/common-lambda/lib/config';
import * as iam from '@aws-cdk/aws-iam';
import { AccountStacks } from '../../common/account-stacks';

export interface IamConfigServiceRoleProps {
  accountStacks: AccountStacks;
  config: c.AcceleratorConfig;
}

export async function createConfigServiceRoles(props: IamConfigServiceRoleProps): Promise<void> {
  const { accountStacks, config } = props;
  const accountKeys = config.getAccountConfigs().map(([accountKey, _]) => accountKey);

  for (const accountKey of accountKeys) {
    const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey);
    if (!accountStack) {
      console.error(`Not able to create stack for "${accountKey}"`);
      continue;
    }

    // Creating role for Config Recorder
    new iam.Role(accountStack, `IAM-ConfigRecorderRole-${accountKey}`, {
      roleName: 'PBMMAccel-ConfigRecorderRole',
      description: 'PBMMAccel - Config Recorder Role',
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRole')],
    });
  }

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  // Creating role for Config Organization Aggregator
  new iam.Role(masterAccountStack, `IAM-ConfigAggregatorRole-${masterAccountKey}`, {
    roleName: 'PBMMAccel-ConfigAggregatorRole',
    description: 'PBMMAccel - Config Aggregator Role',
    assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
    managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSConfigRoleForOrganizations')],
  });
}
