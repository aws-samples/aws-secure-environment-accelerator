import { CloudFormation } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';

const cfn = new CloudFormation();

interface DeleteStackSetInstancesInput {
  stackName: string;
  instanceAccounts: string[];
  instanceRegions: string[];
}

export const handler = async (input: DeleteStackSetInstancesInput) => {
  console.log(`Deleting stack set instances...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, instanceAccounts, instanceRegions } = input;

  const existingInstances = await cfn.listStackInstances(stackName);
  const existingInstanceAccountIds = existingInstances.map(i => i.Account!);

  // Check if there are existing instance account IDs that should not exist
  const instanceAccountsToBeDeleted = existingInstanceAccountIds.filter(id => !instanceAccounts.includes(id));
  if (instanceAccountsToBeDeleted.length === 0) {
    return {
      status: 'UP_TO_DATE',
    };
  }

  console.log(`Deleting stack instances for accounts ${instanceAccountsToBeDeleted.join(', ')}`);

  await cfn.deleteStackInstances({
    StackSetName: stackName,
    Accounts: instanceAccountsToBeDeleted,
    Regions: instanceRegions,
    RetainStacks: false,
  });

  return {
    status: 'SUCCESS',
  };
};
