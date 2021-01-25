import { ScheduledEvent } from 'aws-lambda';

interface InvocationCheckInput {
  scheduledEvent: ScheduledEvent;
  acceleratorRoleName: string;
}

export const handler = async (input: InvocationCheckInput) => {
  console.log(`Invocation Check for CreateAccount Event...`);
  console.log(JSON.stringify(input, null, 2));
  const { acceleratorRoleName, scheduledEvent } = input;
  const requestDetail = scheduledEvent.detail;
  if (
    requestDetail &&
    requestDetail.userIdentity &&
    requestDetail.userIdentity.sessionContext &&
    requestDetail.userIdentity.sessionContext.sessionIssuer &&
    requestDetail.userIdentity.sessionContext.sessionIssuer.userName
  ) {
    if (requestDetail.userIdentity.sessionContext.sessionIssuer.userName === acceleratorRoleName) {
      console.log(`Create Account Performed by Accelerator, No operation required`);
      return true;
    }
  }
  return false;
};
