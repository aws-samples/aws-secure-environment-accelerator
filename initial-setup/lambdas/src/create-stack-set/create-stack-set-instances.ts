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

  await cfn.createOrUpdateStackSetInstances({
    StackSetName: stackName,
    Accounts: instanceAccounts,
    Regions: instanceRegions,
  });

  return {
    status: 'SUCCESS',
  };
};
