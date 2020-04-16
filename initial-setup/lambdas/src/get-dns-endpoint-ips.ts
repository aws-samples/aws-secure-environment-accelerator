import { Route53Resolver } from '@aws-pbmm/common-lambda/lib/aws/r53resolver';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import * as cfnresponse from 'cfn-response';
import { STS } from '@aws-pbmm/common-lambda/lib/aws/sts';

export interface Input {
  endpointId: string;
  accountId: string;
}

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Retriving Default IPAdress for DNS Resolver Endpoint ...`);
  console.log(JSON.stringify(event, null, 2));

  try {
    const accountId = event['ResourceProperties']['AccountId'];
    const endpoitId = event['ResourceProperties']['EndpointResolver'];
    const sts = new STS();
    const credentials = await sts.getCredentialsForAccountAndRole(accountId, 'AcceleratorPipelineRole');
    const r53resolver = new Route53Resolver(credentials);
    const endpointResponse = await r53resolver.getEndpointIpAddress(endpoitId);
    const ips: string[] = [];
    for (const ipaddress of endpointResponse.IpAddresses! || []) {
      ips.push(ipaddress.Ip!);
    }
    console.log(ips);
    cfnresponse.send(event, context, cfnresponse.SUCCESS, { Ips: ips });
  } catch (error) {
    cfnresponse.send(event, context, cfnresponse.FAILED, {});
  }
};
