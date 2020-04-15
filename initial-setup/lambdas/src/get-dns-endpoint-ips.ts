import { Route53Resolver } from '@aws-pbmm/common-lambda/lib/aws/r53resolver';
import * as cfnresponse from 'cfn-response';
import { Context, CloudFormationCustomResourceEvent} from 'aws-lambda'

export interface Input {
  endpointId: string;
}

export const handler = async (event:CloudFormationCustomResourceEvent, context: Context) => {
  console.log(`Retriving Default IPAdress for DNS Resolver Endpoint ...`);
  console.log(JSON.stringify(event, null, 2));

  const r53resolver = new Route53Resolver();
  const resolver = event['ResourceProperties']['EndpointResolver'];

  const endpointResponse = await r53resolver.getEndpointIpAddress(resolver);
  const ips: string[] = [];
  for(const ipaddress of endpointResponse.IpAddresses! || []){
    ips.push(ipaddress.Ip!)
  }
  console.log(ips);
  cfnresponse.send(event, context, 'SUCCESS', ips, `${resolver.replace('-','')}`)
};
