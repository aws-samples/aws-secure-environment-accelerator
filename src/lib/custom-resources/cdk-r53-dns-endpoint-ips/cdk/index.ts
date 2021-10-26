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

import * as cdk from '@aws-cdk/core';
import * as custom from '@aws-cdk/custom-resources';
import * as iam from '@aws-cdk/aws-iam';

export interface R53DnsEndpointIpsProps {
  resolverEndpointId: string;
}

/**
 * Custom resource implementation that retrive IPs for a created DNS Endpoint.
 */
export class R53DnsEndpointIps extends cdk.Construct {
  private readonly resource: custom.AwsCustomResource;

  constructor(scope: cdk.Construct, id: string, props: R53DnsEndpointIpsProps) {
    super(scope, id);
    const { resolverEndpointId } = props;

    const physicalResourceId = custom.PhysicalResourceId.of(resolverEndpointId);
    const onCreateOrUpdate: custom.AwsSdkCall = {
      service: 'Route53Resolver',
      action: 'listResolverEndpointIpAddresses',
      physicalResourceId,
      parameters: {
        ResolverEndpointId: resolverEndpointId,
      },
    };

    this.resource = new custom.AwsCustomResource(this, 'Resource', {
      resourceType: 'Custom::GetResolverEndpointIps',
      onCreate: onCreateOrUpdate,
      onUpdate: onCreateOrUpdate,
      policy: custom.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['route53resolver:ListResolverEndpointIpAddresses'],
          resources: ['*'],
        }),
      ]),
    });
  }

  getEndpointIpAddress(index: number): string {
    return this.resource.getResponseField(`IpAddresses.${index}.Ip`);
  }
}
