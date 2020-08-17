import * as cdk from '@aws-cdk/core';
import * as ram from '@aws-cdk/aws-ram';

export interface Route53ResolverRuleSharingProps {
  name: string;
  allowExternalPrincipals: boolean;
  principals: string[];
  resourceArns: string[];
}

/**
 * Construct to share Route53 resolver rules using Resource Access Manager.
 */
export class Route53ResolverRuleSharing extends cdk.Construct {
  constructor(parent: cdk.Construct, id: string, props: Route53ResolverRuleSharingProps) {
    super(parent, id);

    // share the route53 resolver rules
    new ram.CfnResourceShare(this, `Share-${props.name}`, {
      name: props.name,
      allowExternalPrincipals: props.allowExternalPrincipals,
      principals: props.principals,
      resourceArns: props.resourceArns,
    });
  }
}
