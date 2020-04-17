import * as cdk from '@aws-cdk/core';
import { AccountConfig, AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AcceleratorStack, AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { Route53Zones, Route53ZonesProps } from '../common/r53-zones';
import { Route53ResolverEndpoint } from '../common/r53-resolver-endpoint';
import { Route53ResolverRule } from '../common/r53-resolver-rule';
import { Context } from '../utils/context';
import { StackOutputs, getStackOutput } from '../utils/outputs';

export namespace GlobalOptions {
  export interface StackProps extends AcceleratorStackProps {
    acceleratorConfig: AcceleratorConfig;
    context: Context;
    outputs: StackOutputs;
  }

  export class Stack extends AcceleratorStack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);
      const zonesConfig = props.acceleratorConfig['global-options'].zones;
      const mandatoryAccountConfig = props.acceleratorConfig['mandatory-account-configs'];

      // Creating Hosted Zones based on config
      const vpcId = getStackOutput(props.outputs, zonesConfig.account, `Vpc${zonesConfig['resolver-vpc']}`);
      const route53ZonesProps: Route53ZonesProps = {
        zonesConfig: zonesConfig,
        vpcId,
        vpcRegion: props.env?.region || 'ca-central-1',
      };
      const r53Zones = new Route53Zones(this, 'DNSResolvers', route53ZonesProps);

      // Create Endpoints per Account and VPC
      const mandatoryAccounts: Array<string> = Object.keys(mandatoryAccountConfig);
      for (const account of mandatoryAccounts) {
        const accountConfig = (mandatoryAccountConfig as any)[account] as AccountConfig;
        const vpcConfig = accountConfig.vpc!;
        if (!vpcConfig) continue;
        if (!vpcConfig.resolvers) continue;
        // Call r53-resolver-endpoint per Account
        const r53ResolverEndpoints = new Route53ResolverEndpoint(this, 'ResolverEndpoints', {
          vpcConfig,
          outputs: props.outputs,
          context: props.context,
          accountId: props.env?.account!,
          accountName: account,
        });

        // For each Private hosted Zone created in 1) above, create a Resolver rule which points to the Inbound-Endpoint-IP's
        for (const [domain, pzid] of r53Zones.privateZoneToDomainMap.entries()) {
          if (r53ResolverEndpoints.inBoundEndpoint && r53ResolverEndpoints.outBoundEndpoint) {
            const privateRule = new Route53ResolverRule(this, `${domainToName(domain)}-phz-rule`, {
              domain,
              endPoint: r53ResolverEndpoints.outBoundEndpoint,
              ipAddresses: r53ResolverEndpoints.inBoundEndpointIps,
              ruleType: 'FORWARD',
              name: `${domainToName(domain)}-phz-rule`,
            });
            privateRule.node.addDependency(r53ResolverEndpoints);
          }
        }

        // For each on-premise domain defined in the parameters file, create a Resolver rule which points to the specified IP's

        for (const onPremRuleConfig of vpcConfig['on-premise-rules']! || []) {
          if (r53ResolverEndpoints.outBoundEndpoint) {
            const privateRule = new Route53ResolverRule(this, `${domainToName(onPremRuleConfig.zone)}-phz-rule`, {
              domain: onPremRuleConfig.zone,
              endPoint: r53ResolverEndpoints.outBoundEndpoint,
              ipAddresses: r53ResolverEndpoints.inBoundEndpointIps,
              ruleType: 'FORWARD',
              name: `${domainToName(onPremRuleConfig.zone)}-phz-rule`,
            });
            privateRule.node.addDependency(r53ResolverEndpoints);
          }
        }
      }
    }
  }
}

function domainToName(domain: string): string {
  return domain.replace(/\./gi, '-');
}
