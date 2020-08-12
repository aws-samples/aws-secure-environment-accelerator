import * as cdk from '@aws-cdk/core';
import * as r53Resolver from '@aws-cdk/aws-route53resolver';

export interface Route53ResolverRuleProps {
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
export class Route53ResolverRule extends cdk.Construct {
  private readonly rule: r53Resolver.CfnResolverRule;

  constructor(parent: cdk.Construct, id: string, props: Route53ResolverRuleProps) {
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
