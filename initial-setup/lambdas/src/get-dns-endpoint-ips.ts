import { Route53Resolver } from '@aws-pbmm/common-lambda/lib/aws/r53resolver';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { send as sendResponse, SUCCESS, FAILED, ResponseStatus } from 'cfn-response';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';

export interface Input {
  endpointId: string;
  accountId: string;
}

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Retriving Default IPAdress for DNS Resolver Endpoint ...`);
  console.log(JSON.stringify(event, null, 2));

  const sendResponsePromise = (
    responseStatus: ResponseStatus,
    responseData?: object,
    physicalResourceId?: string,
  ): Promise<unknown> => {
    return new Promise(resolve => {
      context.done = resolve;
      sendResponse(event, context, responseStatus, responseData, physicalResourceId);
    });
  };

  let physicalResourceId = 'EndpointIps';
  const requestType = event['ResourceProperties']['RequestType'];
  if (requestType === 'Delete') {
    console.log('No operation to perform Delete Stack');
    await sendResponsePromise(SUCCESS, {}, physicalResourceId);
  }
  try {
    const accountId = event['ResourceProperties']['AccountId'];
    const endpoitId = event['ResourceProperties']['EndpointResolver'];
    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, 'AcceleratorPipelineRole');
    const r53resolver = new Route53Resolver(credentials);
    const endpointResponse = await r53resolver.getEndpointIpAddress(endpoitId);
    interface Output {
      [key: string]: string;
    }
    let output: Output = {};
    for (const [key, ipaddress] of endpointResponse.IpAddresses?.entries() || [].entries()) {
      output[`IpAddress${key + 1}`] = ipaddress.Ip!;
    }
    await sendResponsePromise(SUCCESS, output, physicalResourceId);
  } catch (error) {
    await sendResponsePromise(FAILED, {}, physicalResourceId);
  }
};
