import * as aws from 'aws-sdk';
import {
  ListResolverEndpointIpAddressesResponse,
  ListResolverRulesRequest,
  ListResolverRulesResponse,
} from 'aws-sdk/clients/route53resolver';

export class Route53Resolver {
  private readonly client: aws.Route53Resolver;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Route53Resolver({
      credentials,
    });
  }

  async getEndpointIpAddress(endpointId: string): Promise<ListResolverEndpointIpAddressesResponse> {
    return this.client.listResolverEndpointIpAddresses({ ResolverEndpointId: endpointId }).promise();
  }

  /**
   * to list resolver rules
   * @param maxResults
   * @param nextToken
   */
  async listResolverRules(maxResults: number, nextToken?: string): Promise<ListResolverRulesResponse> {
    let params: ListResolverRulesRequest = {};
    if (nextToken) {
      params = {
        MaxResults: maxResults,
        NextToken: nextToken,
      };
    } else {
      params = {
        MaxResults: maxResults,
      };
    }
    return this.client.listResolverRules(params).promise();
  }
}
