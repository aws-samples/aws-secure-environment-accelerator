import { CloudFormation } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';

const cfn = new CloudFormation();

interface CreateMasterExecutionRoleInput {
  stackName: string;
  instanceAccounts: string[];
  instanceRegions: string[];
}

export const handler = async (input: CreateMasterExecutionRoleInput) => {
  console.log(`Creating stack set instances...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, instanceAccounts, instanceRegions } = input;

  await cfn.createOrUpdateStackSetInstances({
    StackSetName: stackName,
    Accounts: instanceAccounts,
    Regions: instanceRegions,
  });
};
