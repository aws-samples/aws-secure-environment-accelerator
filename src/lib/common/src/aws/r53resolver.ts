import * as aws from 'aws-sdk';
import {
  ListResolverEndpointIpAddressesResponse,
  AssociateResolverRuleRequest,
  AssociateResolverRuleResponse,
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
   * to associate resolver rule
   * @param resolverRuleId
   * @param vpcId
   * @param name
   */
  async associateResolverRule(
    resolverRuleId: string,
    vpcId: string,
    name?: string,
  ): Promise<AssociateResolverRuleResponse> {
    const param: AssociateResolverRuleRequest = {
      ResolverRuleId: resolverRuleId,
      VPCId: vpcId,
      Name: name,
    };
    return this.client.associateResolverRule(param).promise();
  }
}
