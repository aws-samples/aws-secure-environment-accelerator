import { AccountVendingMachine } from '@aws-pbmm/common-lambda/lib/aws/account-vending-machine';

const SUCCESS_STATUSES = ['AVAILABLE'];
const FAILED_STATUSES = ['ERROR'];

interface CheckStepInput {
  accountName: string;
  provisionToken: string;
}

export const handler = async (input: Partial<CheckStepInput>) => {
  console.log(`Verifying status of provisioned account with parameters ${JSON.stringify(input, null, 2)}`);

  const { accountName, provisionToken } = input;
  console.log('input: ', input);

  // Check the status of the provisioned account.
  const avm = new AccountVendingMachine();
  const response = await avm.isAccountAvailable(accountName!!, provisionToken!!);
  console.log('accountStatus: ' + response.status!!);

  if (!response) {
    return {
      status: 'FAILURE',
      statusReason: 'Unable to create ' + accountName + ' account using Account Vending Machine!',
    };
  }

  const status = response.status!!;
  if (SUCCESS_STATUSES.includes(status)) {
    return {
      status: 'SUCCESS',
      statusReason: response.statusReason || '',
    };
  } else if (FAILED_STATUSES.includes(status)) {
    return {
      status: 'FAILURE',
      statusReason: response!.statusReason || '',
    };
  }

  return {
    status: 'IN_PROGRESS',
    statusReason: response.statusReason || '',
  };
};
