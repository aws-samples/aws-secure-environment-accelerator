import { ScheduledEvent } from 'aws-lambda';
import { getInvoker } from './../utils';

interface InvocationCheckInput {
  scheduledEvent: ScheduledEvent;
  acceleratorRoleName: string;
}

export const handler = async (input: InvocationCheckInput) => {
  console.log(`Invocation Check for CreateAccount Event...`);
  console.log(JSON.stringify(input, null, 2));
  const { acceleratorRoleName, scheduledEvent } = input;
  const invokedBy = getInvoker(input.scheduledEvent);
  if (invokedBy && invokedBy === acceleratorRoleName) {
    console.log(`Create Account Performed by Accelerator, No operation required`);
    return true;
  }

  return false;
};
