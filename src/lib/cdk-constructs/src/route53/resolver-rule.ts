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

import * as cdk from 'aws-cdk-lib';
import * as r53Resolver from 'aws-cdk-lib/aws-route53resolver';
import { Construct } from 'constructs';

export interface ResolverRuleProps {
  vpcId: string;
  name: string;
  domain: string;
  ruleType: string;
  ipAddresses: string[];
  endpoint?: string;
}

/**
 * Auxiliary construct that creates a Route53 resolver rule for the and associates it with the given VPC.
 */
export class ResolverRule extends Construct {
  private readonly rule: r53Resolver.CfnResolverRule;

  constructor(parent: Construct, id: string, props: ResolverRuleProps) {
    super(parent, id);
    const targetIps = props.ipAddresses.map(ip => ({
      ip,
      port: '53',
    }));

    this.rule = new r53Resolver.CfnResolverRule(this, 'Rule', {
      domainName: props.domain,
      ruleType: props.ruleType,
      resolverEndpointId: props.endpoint,
      name: props.name,
      targetIps,
    });

    new r53Resolver.CfnResolverRuleAssociation(this, 'Association', {
      resolverRuleId: this.rule.ref,
      vpcId: props.vpcId,
    });
  }

  get ruleId(): string {
    return this.rule.ref;
  }
}
