import { CloudFormation } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';

const cfn = new CloudFormation();

interface CreateMasterExecutionRoleInput {
  stackName: string;
  accounts: string[];
  regions: string[];
}

export const handler = async (input: CreateMasterExecutionRoleInput) => {
  console.log(`Creating stack set instances...`);
  console.log(JSON.stringify(input, null, 2));

  const { stackName, accounts, regions } = input;

  await cfn.createOrUpdateStackSetInstances({
    StackSetName: stackName,
    Regions: regions,
    Accounts: accounts,
  });
};
