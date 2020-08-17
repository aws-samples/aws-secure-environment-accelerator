import { CloudFormation } from '@aws-accelerator/common/src/aws/cloudformation';

const cfn = new CloudFormation();

interface UpdateStackSetInstancesInput {
  stackName: string;
  instanceAccounts: string[];
  instanceRegions: string[];
}

export const handler = async (input: UpdateStackSetInstancesInput) => {
  console.log(`Updating stack set instances...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, instanceAccounts, instanceRegions } = input;

  const existingInstances = await cfn.listStackInstances(stackName);
  const existingInstanceAccountIds = existingInstances.map(i => i.Account);

  // Check if there are instance account IDs that exist yet and need to be updated
  const instanceAccountsToBeUpdated = instanceAccounts.filter(id => existingInstanceAccountIds.includes(id));
  if (instanceAccountsToBeUpdated.length === 0) {
    return {
      status: 'UP_TO_DATE',
    };
  }

  console.log(`Updating stack instances for accounts ${instanceAccountsToBeUpdated.join(', ')}`);

  await cfn.updateStackInstances({
    StackSetName: stackName,
    Accounts: instanceAccountsToBeUpdated,
    Regions: instanceRegions,
  });

  return {
    status: 'SUCCESS',
  };
};
