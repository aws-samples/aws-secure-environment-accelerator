import { CloudFormation } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';

const cfn = new CloudFormation();

interface CreateStackSetInstancesInput {
  stackName: string;
  instanceAccounts: string[];
  instanceRegions: string[];
}

export const handler = async (input: CreateStackSetInstancesInput) => {
  console.log(`Creating stack set instances...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, instanceAccounts, instanceRegions } = input;

  const existingInstances = await cfn.listStackInstances(stackName);
  const existingInstanceAccountIds = existingInstances.map(i => i.Account);

  // Check if there are instance account IDs that do not exist yet
  const instanceAccountsToBeCreated = instanceAccounts.filter(id => !existingInstanceAccountIds.includes(id));
  if (instanceAccountsToBeCreated.length === 0) {
    return {
      status: 'UP_TO_DATE',
    };
  }

  console.log(`Creating stack instances for accounts ${instanceAccountsToBeCreated.join(', ')}`);

  await cfn.createStackInstances({
    StackSetName: stackName,
    Accounts: instanceAccountsToBeCreated,
    Regions: instanceRegions,
  });

  return {
    status: 'SUCCESS',
  };
};
