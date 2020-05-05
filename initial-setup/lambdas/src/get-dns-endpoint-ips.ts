import { Route53Resolver } from '@aws-pbmm/common-lambda/lib/aws/r53resolver';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { send as sendResponse, SUCCESS, FAILED, ResponseStatus } from 'cfn-response';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';

function sendResponsePromise(
  event: CloudFormationCustomResourceEvent,
  context: Context,
  responseStatus: ResponseStatus,
  responseData?: object,
  physicalResourceId?: string,
): Promise<unknown> {
  return new Promise(resolve => {
    // tslint:disable-next-line:deprecation
    context.done = resolve;
    // tslint:disable-next-line
    sendResponse(event, context, responseStatus, responseData, physicalResourceId);
  });
}

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Retrieving default IP address for DNS resolver endpoint...`);
  console.log(JSON.stringify(event, null, 2));

  const resourceId = 'EndpointIps';
  const requestType = event.RequestType;
  if (requestType === 'Delete') {
    console.log('No operation to perform Delete Stack');
    await sendResponsePromise(event, context, SUCCESS, {}, resourceId);
  }

  try {
    const executionRoleName = process.env.ACCELERATOR_EXECUTION_ROLE_NAME;
    if (!executionRoleName) {
      throw new Error(`Please set environment variable "ACCELERATOR_EXECUTION_ROLE_NAME"`);
    }

    const accountId = event.ResourceProperties.AccountId;
    const endpointId = event.ResourceProperties.EndpointResolver;

    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, executionRoleName);

    // Find route53 endpoint IP addresses
    const r53resolver = new Route53Resolver(credentials);
    const response = await r53resolver.getEndpointIpAddress(endpointId);
    const ipAddresses = response.IpAddresses || [];

    const output: { [key: string]: string | undefined } = {};
    ipAddresses.forEach((ipAddress, index) => (output[`IpAddress${index}`] = ipAddress.Ip));

    await sendResponsePromise(event, context, SUCCESS, output, resourceId);
  } catch (error) {
    console.error(error);

    await sendResponsePromise (
      event,
      context,
      FAILED,
      {
        status: 'FAILED',
        statusReason: JSON.stringify(error),
      },
      resourceId,
    );
  }
};
