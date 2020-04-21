import * as cdk from '@aws-cdk/core';
import * as r53Resolver from '@aws-cdk/aws-route53resolver';

export interface Route53ResolverRuleProps {
  endPoint: string;
  ipAddresses: string; // Ip Address seperated by ,
  domain: string;
  name: string;
  ruleType: string;
  vpcId: string;
}

export class Route53ResolverRule extends cdk.Construct {
  readonly ruleId: string;
  constructor(parent: cdk.Construct, name: string, props: Route53ResolverRuleProps) {
    super(parent, name);

    const targetIps: r53Resolver.CfnResolverRule.TargetAddressProperty[] = [];
    for (const ip of props.ipAddresses.split(',')) {
      if (!ip) {
        continue;
      }
      targetIps.push({
        ip,
        port: '53',
      });
    }

    const rule = new r53Resolver.CfnResolverRule(this, name, {
      domainName: props.domain,
      ruleType: props.ruleType,
      resolverEndpointId: props.endPoint,
      name: props.name,
      targetIps,
    });

    new r53Resolver.CfnResolverRuleAssociation(this, `${name}-association`, {
      resolverRuleId: rule.ref,
      vpcId: props.vpcId,
    });
    this.ruleId = rule.ref;
  }
}
