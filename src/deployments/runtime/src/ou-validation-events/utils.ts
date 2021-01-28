import { ScheduledEvent } from 'aws-lambda';
export function getInvoker(input: ScheduledEvent): string | undefined {
  const requestDetail = input.detail;
  if (
    requestDetail &&
    requestDetail.userIdentity &&
    requestDetail.userIdentity.sessionContext &&
    requestDetail.userIdentity.sessionContext.sessionIssuer
  ) {
    return requestDetail.userIdentity.sessionContext.sessionIssuer.userName;
  }
}
