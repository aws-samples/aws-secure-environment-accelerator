import { CloudFormation } from '@aws-pbmm/common-lambda/lib/aws/cloudformation';

const SUCCESS_STATUSES = ['CREATE_COMPLETE', 'UPDATE_COMPLETE'];
const FAILED_STATUSES = ['CREATE_FAILED', 'ROLLBACK_COMPLETE', 'ROLLBACK_FAILED', 'UPDATE_ROLLBACK_COMPLETE'];

interface CheckStepInput {
  stackName?: string;
}

export const handler = async (input: Partial<CheckStepInput>) => {
  console.log(`Verifying stack with parameters ${JSON.stringify(input, null, 2)}`);

  const { stackName } = input;

  // Deploy the stack using the assumed role in the current region
  const cfn = new CloudFormation();
  const stack = await cfn.describeStack(stackName!);
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
