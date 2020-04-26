import { EC2 } from '@aws-pbmm/common-lambda/lib/aws/ec2';
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
  console.log(`Adding Route to Route Table...`);
  console.log(JSON.stringify(event, null, 2));

  const resourceId = 'AddPcxRoute';
  const requestType = event.RequestType;
  if (requestType === 'Delete') {
  if (requestType == 'Delete') {
    console.log('No operation to perform Delete Stack');
    await sendResponsePromise(event, context, SUCCESS, {}, resourceId);
  }

  try {
    const executionRoleName = process.env.ACCELERATOR_EXECUTION_ROLE_NAME;
    if (!executionRoleName) {
      throw new Error(`Please set environment variable "ACCELERATOR_EXECUTION_ROLE_NAME"`);
    }

    const accountId = event.ResourceProperties.AccountId;
    const routeTableId = event.ResourceProperties.RouteTableId;
    const pcxId = event.ResourceProperties.PeeringConnectionId;
    const destinationCidrblock = event.ResourceProperties.DestinationCidrBlock;

    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, executionRoleName);

    // Find route53 endpoint IP addresses
    const ec2 = new EC2(credentials);
    const response = await ec2.createRouteForPcx(routeTableId, destinationCidrblock, pcxId);
    console.log(response);

    await sendResponsePromise(event, context, SUCCESS, {}, resourceId);
  } catch (error) {
    console.error(error);

    await sendResponsePromise(
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
