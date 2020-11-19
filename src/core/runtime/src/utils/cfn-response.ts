import { send as sendResponse, SUCCESS, FAILED, ResponseStatus } from 'cfn-response';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';

export const sendResponsePromise = (
  event: CloudFormationCustomResourceEvent,
  context: Context,
  responseStatus: ResponseStatus,
  responseData?: object,
  physicalResourceId?: string,
): Promise<unknown> => {
  return new Promise(resolve => {
    // eslint-disable-next-line deprecation/deprecation
    context.done = resolve;
    // eslint-disable-next-line
    sendResponse(event, context, responseStatus, responseData, physicalResourceId);
  });
};
