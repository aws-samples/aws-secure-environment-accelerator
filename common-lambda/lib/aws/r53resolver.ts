import * as aws from 'aws-sdk';
import * as route53resolver from 'aws-sdk/clients/route53resolver';

export class Route53Resolver {
  private readonly client: aws.Route53Resolver;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Route53Resolver({
      region: 'ca-central-1',
      credentials,
    });
  }

  async getEndpointIpAddress(endpointId: string): Promise<route53resolver.ListResolverEndpointIpAddressesResponse> {
    return this.client.listResolverEndpointIpAddresses({ ResolverEndpointId: endpointId }).promise();
  }
}
