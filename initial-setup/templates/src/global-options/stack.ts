import * as cdk from '@aws-cdk/core';
import { AccountConfig, AcceleratorConfig, OrganizationalUnit, VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
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

  interface VpcConfigType {
    [key: string]: VpcConfig;
  }

  export class Stack extends AcceleratorStack {
    constructor(scope: cdk.Construct, id: string, props: StackProps) {
      super(scope, id, props);
      const vpcInBoundMapping = new Map<string, string>();
      const vpcOutBoundMapping = new Map<string, string>();
      const zonesConfig = props.acceleratorConfig['global-options'].zones;
      const mandatoryAccountConfig = props.acceleratorConfig['mandatory-account-configs'];
      const organizationalUnitsConfig = props.acceleratorConfig['organizational-units'];

      // Creating Hosted Zones based on config
      const vpcId = getStackOutput(props.outputs, zonesConfig.account, `Vpc${zonesConfig['resolver-vpc']}`);
      const route53ZonesProps: Route53ZonesProps = {
        zonesConfig,
        vpcId,
        vpcRegion: props.env?.region || 'ca-central-1',
      };
      const r53Zones = new Route53Zones(this, 'DNSResolvers', route53ZonesProps);

      // Create Endpoints per Account and VPC
      const vpcConfigs: VpcConfigType = {};
      for (const [account, vpcConfig] of Object.entries(mandatoryAccountConfig)) {
        vpcConfigs[account] = vpcConfig.vpc!;
      }
      for (const [account, vpcConfig] of Object.entries(organizationalUnitsConfig)) {
        vpcConfigs[account] = vpcConfig.vpc;
      }
      for (const [account, vpcConfig] of Object.entries(vpcConfigs)) {
        if (!vpcConfig) {
          continue;
        }
        if (!vpcConfig.resolvers) {
          continue;
        }
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
              vpcId: r53ResolverEndpoints.vpcId,
            });
            privateRule.node.addDependency(r53ResolverEndpoints);

            // Add RuleId to Output
            new cdk.CfnOutput(this, `${vpcConfig.name}PHZRule${domain}`, {
              value: privateRule.ruleId,
            });
          }
        }

        // For each on-premise domain defined in the parameters file, create a Resolver rule which points to the specified IP's

        for (const onPremRuleConfig of vpcConfig['on-premise-rules']! || []) {
          if (r53ResolverEndpoints.outBoundEndpoint) {
            const privateRule = new Route53ResolverRule(
              this,
              `${domainToName(onPremRuleConfig.zone)}-on-prem-phz-rule`,
              {
                domain: onPremRuleConfig.zone,
                endPoint: r53ResolverEndpoints.outBoundEndpoint,
                ipAddresses: onPremRuleConfig['outbound-ips'].join(','),
                ruleType: 'FORWARD',
                name: `${domainToName(onPremRuleConfig.zone)}-phz-rule`,
                vpcId: r53ResolverEndpoints.vpcId,
              },
            );
            privateRule.node.addDependency(r53ResolverEndpoints);

            // Add RuleId to Output
            new cdk.CfnOutput(this, `${vpcConfig.name}PHZRule${onPremRuleConfig.zone}`, {
              value: privateRule.ruleId,
            });
          }
        }

        // Adding VPC Inbound Endpoint to Output
        if (r53ResolverEndpoints.inBoundEndpoint) {
          vpcInBoundMapping.set(vpcConfig.name, r53ResolverEndpoints.inBoundEndpoint);
          new cdk.CfnOutput(this, `${vpcConfig.name}InboundEndpoint`, {
            value: r53ResolverEndpoints.inBoundEndpoint,
          });
        }

        // Adding VPC Outbound Endpoint to Output
        if (r53ResolverEndpoints.outBoundEndpoint) {
          vpcOutBoundMapping.set(vpcConfig.name, r53ResolverEndpoints.outBoundEndpoint);
          new cdk.CfnOutput(this, `${vpcConfig.name}OutboundEndpoint`, {
            value: r53ResolverEndpoints.inBoundEndpoint,
          });
        }

        // Adding Inbound IPs to Output
        if (r53ResolverEndpoints.inBoundEndpointIps) {
          new cdk.CfnOutput(this, `${vpcConfig.name}InboundEndpointIPs`, {
            value: r53ResolverEndpoints.inBoundEndpointIps,
          });
        }
      }

      // // Check for MAD deployment, If already deployed then create Resolver Rule for MAD IPs
      for (const [account, accountConfig] of Object.entries(mandatoryAccountConfig)) {
        const deploymentConfig = accountConfig.deployments;
        if (!deploymentConfig || !deploymentConfig.mad) {
          continue;
        }
        const madConfig = deploymentConfig.mad;
        let madIPs;
        try {
          madIPs = getStackOutput(props.outputs, account, `MADIPs${madConfig['dns-domain'].replace(/\./gi, '')}`);
        } catch (error) {
          console.log(`MAD is not deployed yet in account ${account}`);
          continue;
        }
        const resolverAccount = madConfig['central-resolver-rule-account'];
        const resolverVpc = madConfig['central-resolver-rule-vpc'];
        const resolverVpcId = getStackOutput(props.outputs, resolverAccount, `Vpc${resolverVpc}`);
        const rule = new Route53ResolverRule(this, `${domainToName(madConfig['dns-domain'])}-phz-rule`, {
          domain: madConfig['dns-domain'],
          endPoint: vpcOutBoundMapping.get(resolverVpc)!,
          ipAddresses: madIPs,
          ruleType: 'FORWARD',
          name: `${domainToName(madConfig['dns-domain'])}-mad-phz-rule`,
          vpcId: resolverVpcId,
        });

        // Add RuleId to Output
        new cdk.CfnOutput(this, `${resolverVpc}PHZRule${madConfig['dns-domain']}`, {
          value: rule.ruleId,
        });
      }
      // Add Outputs
      // Add Public Hosted Zone to Output
      for (const [domain, phz] of r53Zones.publicZoneToDomainMap.entries()) {
        new cdk.CfnOutput(this, `PHZ${domain}`, {
          value: phz,
        });
      }

      // Add Private Hosted Zone to Output
      for (const [domain, phz] of r53Zones.privateZoneToDomainMap.entries()) {
        new cdk.CfnOutput(this, `PHZ${domain}`, {
          value: phz,
        });
      }
    }
  }
}

function domainToName(domain: string): string {
  return domain.replace(/\./gi, '-');
}
