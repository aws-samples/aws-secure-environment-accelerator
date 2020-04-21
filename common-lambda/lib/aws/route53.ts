import * as aws from 'aws-sdk';
import {
  ListHostedZonesRequest,
  ListHostedZonesResponse,
  AssociateVPCWithHostedZoneRequest,
  AssociateVPCWithHostedZoneResponse,
  CreateVPCAssociationAuthorizationRequest,
  CreateVPCAssociationAuthorizationResponse,
  DeleteVPCAssociationAuthorizationRequest,
  DeleteVPCAssociationAuthorizationResponse,
} from 'aws-sdk/clients/route53';

export class Route53 {
  private readonly client: aws.Route53;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Route53({
      credentials,
    });
  }

  /**
   * to list the hosted zones
   * @param input
   */
  async listHostedZones(input: ListHostedZonesRequest): Promise<ListHostedZonesResponse> {
    return await this.client.listHostedZones(input).promise();
  }

  /**
   * to authorize the association of VPC with Hosted zone
   * must use the account that is used to create Hosted zone, to execute the request
   * @param input
   */
  async associateVPCWithHostedZone(
    input: AssociateVPCWithHostedZoneRequest,
  ): Promise<AssociateVPCWithHostedZoneResponse> {
    return await this.client.associateVPCWithHostedZone(input).promise();
  }

  /**
   * to associate the VPC with Hosted zone
   * must use the account that is used to create the VPC, to execute the request
   * @param input
   */
  async createVPCAssociationAuthorization(
    input: CreateVPCAssociationAuthorizationRequest,
  ): Promise<CreateVPCAssociationAuthorizationResponse> {
    return await this.client.createVPCAssociationAuthorization(input).promise();
  }

  /**
   * to remove authorization to associate VPC with Hosted zone
   * must use the account that is used to create Hosted zone, to execute the request
   * @param input
   */
  async deleteVPCAssociationAuthorization(
    input: DeleteVPCAssociationAuthorizationRequest,
  ): Promise<DeleteVPCAssociationAuthorizationResponse> {
    return await this.client.deleteVPCAssociationAuthorization(input).promise();
  }
}
