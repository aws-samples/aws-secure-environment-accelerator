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
   * @param maxItems
   * @param nextMarker
   */
  async listHostedZones(maxItems: string, nextMarker?: string): Promise<ListHostedZonesResponse> {
    let params: ListHostedZonesRequest = {};
    if (nextMarker) {
      params = {
        MaxItems: maxItems,
        Marker: nextMarker,
      };
    } else {
      params = {
        MaxItems: maxItems,
      };
    }
    return this.client.listHostedZones(params).promise();
  }

  /**
   * to authorize the association of VPC with Hosted zone
   * must use the account that is used to create Hosted zone, to execute the request
   * @param privateHostedZoneId
   * @param vpcId
   * @param vpcRegion
   */
  async associateVPCWithHostedZone(
    privateHostedZoneId: string,
    vpcId: string,
    vpcRegion: string,
  ): Promise<AssociateVPCWithHostedZoneResponse> {
    const params: AssociateVPCWithHostedZoneRequest = {
      HostedZoneId: privateHostedZoneId,
      VPC: {
        VPCId: vpcId,
        VPCRegion: vpcRegion,
      },
    };
    return this.client.associateVPCWithHostedZone(params).promise();
  }

  /**
   * to associate the VPC with Hosted zone
   * must use the account that is used to create the VPC, to execute the request
   * @param privateHostedZoneId
   * @param vpcId
   * @param vpcRegion
   */
  async createVPCAssociationAuthorization(
    privateHostedZoneId: string,
    vpcId: string,
    vpcRegion: string,
  ): Promise<CreateVPCAssociationAuthorizationResponse> {
    const params: CreateVPCAssociationAuthorizationRequest = {
      HostedZoneId: privateHostedZoneId,
      VPC: {
        VPCId: vpcId,
        VPCRegion: vpcRegion,
      },
    };
    return this.client.createVPCAssociationAuthorization(params).promise();
  }

  /**
   * to remove authorization to associate VPC with Hosted zone
   * must use the account that is used to create Hosted zone, to execute the request
   * @param privateHostedZoneId
   * @param vpcId
   * @param vpcRegion
   */
  async deleteVPCAssociationAuthorization(
    privateHostedZoneId: string,
    vpcId: string,
    vpcRegion: string,
  ): Promise<DeleteVPCAssociationAuthorizationResponse> {
    const params: DeleteVPCAssociationAuthorizationRequest = {
      HostedZoneId: privateHostedZoneId,
      VPC: {
        VPCId: vpcId,
        VPCRegion: vpcRegion,
      },
    };
    return this.client.deleteVPCAssociationAuthorization(params).promise();
  }
}
