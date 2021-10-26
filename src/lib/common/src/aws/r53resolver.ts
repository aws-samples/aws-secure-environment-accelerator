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
  ListResolverEndpointIpAddressesResponse,
  AssociateResolverRuleRequest,
  AssociateResolverRuleResponse,
} from 'aws-sdk/clients/route53resolver';
import { throttlingBackOff } from './backoff';

export class Route53Resolver {
  private readonly client: aws.Route53Resolver;

  public constructor(credentials?: aws.Credentials) {
    this.client = new aws.Route53Resolver({
      credentials,
    });
  }

  async getEndpointIpAddress(endpointId: string): Promise<ListResolverEndpointIpAddressesResponse> {
    return throttlingBackOff(() =>
      this.client.listResolverEndpointIpAddresses({ ResolverEndpointId: endpointId }).promise(),
    );
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
    return throttlingBackOff(() => this.client.associateResolverRule(param).promise());
  }
}
