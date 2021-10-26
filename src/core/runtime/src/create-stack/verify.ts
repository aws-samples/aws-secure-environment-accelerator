import { CloudFormation } from '@aws-accelerator/common/src/aws/cloudformation';
import { STS } from '@aws-accelerator/common/src/aws/sts';

const SUCCESS_STATUSES = ['CREATE_COMPLETE', 'UPDATE_COMPLETE'];
const FAILED_STATUSES = ['CREATE_FAILED', 'ROLLBACK_COMPLETE', 'ROLLBACK_FAILED', 'UPDATE_ROLLBACK_COMPLETE'];

interface CheckStepInput {
  stackName?: string;
  accountId?: string;
  region?: string;
  assumeRoleName?: string;
}
const sts = new STS();

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const handler = async (input: Partial<CheckStepInput>) => {
  console.log(`Verifying stack with parameters ${JSON.stringify(input, null, 2)}`);

  const { stackName, accountId, assumeRoleName, region } = input;

  // Deploy the stack using the assumed role in the current region
  let cfn: CloudFormation;
  if (accountId && assumeRoleName) {
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, assumeRoleName);
    cfn = new CloudFormation(credentials, region);
  } else {
    cfn = new CloudFormation();
  }
  let stack;
  let retries = 0;
  do {
    stack = await cfn.describeStack(stackName!);
    if (!stack) {
      console.log(`Could not describe stack, retrying ${retries + 1} of 12 times`);
      retries = retries + 1;
      await sleep(10000);
    }
  } while (!stack && retries < 12);
  if (!stack) {
    return {
      status: 'FAILURE',
      statusReason: `Stack with name "${stackName}" does not exists`,
    };
  }

  const status = stack.StackStatus;
  if (SUCCESS_STATUSES.includes(status)) {
    return {
      status: 'SUCCESS',
      statusReason: stack.StackStatusReason || '',
      outputs: stack.Outputs,
    };
  } else if (FAILED_STATUSES.includes(status)) {
    return {
      status: 'FAILURE',
      statusReason: stack.StackStatusReason,
    };
  }
  return {
    status: 'IN_PROGRESS',
    statusReason: stack.StackStatusReason || '',
  };
};
