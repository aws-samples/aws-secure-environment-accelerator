import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as r53Resolver from '@aws-cdk/aws-route53resolver';
import * as cfn from '@aws-cdk/aws-cloudformation';

import { VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Context } from '../utils/context';
import { StackOutputs, getStackOutput } from '../utils/outputs';

export interface Route53ResolverRuleProps {
  endPoint: string;
  ipAddresses: string; // Ip Address seperated by ,
  domain: string;
  name: string;
  ruleType: string;
}

export class Route53ResolverRule extends cdk.Construct {
  readonly ruleId: string;
  constructor(parent: cdk.Construct, name: string, props: Route53ResolverRuleProps) {
    super(parent, name);

    const inBoundRuleTargetIps: Array<r53Resolver.CfnResolverRule.TargetAddressProperty> = [];
    for (const ip of props.ipAddresses.split(',')) {
      inBoundRuleTargetIps.push({
        ip: ip,
        port: '53',
      });
    }

    const rule = new r53Resolver.CfnResolverRule(this, name, {
      domainName: props.domain,
      ruleType: props.ruleType,
      resolverEndpointId: props.endPoint,
      name: props.name,
      targetIps: inBoundRuleTargetIps,
    });
    this.ruleId = rule.ref;
  }
}
