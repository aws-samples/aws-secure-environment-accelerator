/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import aws from './aws-client';
import {
  GetHostedZoneResponse,
  ListHostedZonesResponse,
  AssociateVPCWithHostedZoneRequest,
  AssociateVPCWithHostedZoneResponse,
  CreateVPCAssociationAuthorizationRequest,
  CreateVPCAssociationAuthorizationResponse,
  DeleteVPCAssociationAuthorizationRequest,
  DeleteVPCAssociationAuthorizationResponse,
} from 'aws-sdk/clients/route53';
import { throttlingBackOff } from './backoff';

export class Route53 {
  private readonly client: aws.Route53;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Route53({
      credentials,
    });
  }

  async getHostedZone(hostedZoneId: string): Promise<GetHostedZoneResponse> {
    return throttlingBackOff(() =>
      this.client
        .getHostedZone({
          Id: hostedZoneId,
        })
        .promise(),
    );
  }

  /**
   * to list the hosted zones
   * @param maxItems
   * @param nextMarker
   */
  async listHostedZones(maxItems?: string, nextMarker?: string): Promise<ListHostedZonesResponse> {
    return throttlingBackOff(() =>
      this.client
        .listHostedZones({
          MaxItems: maxItems,
          Marker: nextMarker,
        })
        .promise(),
    );
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
    return throttlingBackOff(() => this.client.associateVPCWithHostedZone(params).promise());
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
    return throttlingBackOff(() => this.client.createVPCAssociationAuthorization(params).promise());
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
    return throttlingBackOff(() => this.client.deleteVPCAssociationAuthorization(params).promise());
  }
}
