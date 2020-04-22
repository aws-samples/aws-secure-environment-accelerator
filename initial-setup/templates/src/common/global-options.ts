import * as cdk from '@aws-cdk/core';
import { AcceleratorConfig, VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Account } from '../utils/accounts';
import { Context } from '../utils/context';
import { StackOutputs, getStackOutput } from '../utils/outputs';
import { Route53ZonesProps, Route53Zones } from './r53-zones';
import { Route53ResolverEndpoint } from './r53-resolver-endpoint';
import { Route53ResolverRule } from './r53-resolver-rule';
import { DependentResources } from './dependent-resources-stack';

export interface GlobalOptionsProps {
  acceleratorConfig: AcceleratorConfig;
  context: Context;
  /**
   * The accounts in the organization.
   */
  accounts: Account[];
  /**
   * Outputs
   */
  outputs: StackOutputs
}

interface VpcConfigType {
    [key: string]: VpcConfig;
}
/**
 * Auxiliary construct that creates VPCs for organizational units.
 */
export class GlobalOptionsDeployment extends cdk.Construct {
  readonly outputs = new Map<string, string>();

  constructor(scope: cdk.Construct, id: string, props: GlobalOptionsProps) {
    super(scope, id);

    const { 
      context,
      accounts,
      acceleratorConfig,
    } = props;

    const vpcInBoundMapping = new Map<string, string>();
    const vpcOutBoundMapping = new Map<string, string>();
    const zonesConfig = acceleratorConfig['global-options'].zones;
    const mandatoryAccountConfig = props.acceleratorConfig['mandatory-account-configs'];
    const organizationalUnitsConfig = props.acceleratorConfig['organizational-units'];
    const lzAccountConfig = props.acceleratorConfig["lz-account-configs"];

    // Creating Hosted Zones based on config
    const vpcId = getStackOutput(props.outputs, zonesConfig.account, `Vpc${zonesConfig['resolver-vpc']}`);
    const route53ZonesProps: Route53ZonesProps = {
        zonesConfig,
        vpcId,
        vpcRegion: cdk.Aws.REGION,
    };
    const r53Zones = new Route53Zones(this, 'DNSResolvers', route53ZonesProps);
    // Create Endpoints per Account and VPC
    const vpcConfigs: VpcConfigType = {};
    for (const [account, vpcConfig] of Object.entries(mandatoryAccountConfig)) {
        vpcConfigs[account] = vpcConfig.vpc!;
    }
    for (const [account, vpcConfig] of Object.entries(organizationalUnitsConfig)) {
        vpcConfigs[account] = vpcConfig.vpc!;
    }
    for (const [account, vpcConfig] of Object.entries(lzAccountConfig)) {
        vpcConfigs[account] = vpcConfig.vpc!;
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
          accountId: cdk.Aws.ACCOUNT_ID,
          accountName: account,
        });
        
        // For each Private hosted Zone created in 1) above, create a Resolver rule which points to the Inbound-Endpoint-IP's
        for (const [domain, pzid] of r53Zones.privateZoneToDomainMap.entries()) {
          if (r53ResolverEndpoints.inBoundEndpoint && r53ResolverEndpoints.outBoundEndpoint) {
            const rule = new Route53ResolverRule(this, `${domainToName(domain)}-phz-rule`, {
              domain,
              endPoint: r53ResolverEndpoints.outBoundEndpoint,
              ipAddresses: r53ResolverEndpoints.inBoundEndpointIps,
              ruleType: 'FORWARD',
              name: `${domainToName(domain)}-phz-rule`,
              vpcId: r53ResolverEndpoints.vpcId,
            });
            rule.node.addDependency(r53ResolverEndpoints);

            this.outputs.set(`${vpcConfig.name}PHZRule${domain}`, rule.ruleId);
          }
        }

        // For each on-premise domain defined in the parameters file, create a Resolver rule which points to the specified IP's

        for (const onPremRuleConfig of vpcConfig['on-premise-rules']! || []) {
          if (r53ResolverEndpoints.outBoundEndpoint) {
            const rule = new Route53ResolverRule(
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
            rule.node.addDependency(r53ResolverEndpoints);

            this.outputs.set(`${vpcConfig.name}PHZRule${onPremRuleConfig.zone}`, rule.ruleId);
          }
        }

        // Adding VPC Inbound Endpoint to Output
        if (r53ResolverEndpoints.inBoundEndpoint) {
          vpcInBoundMapping.set(vpcConfig.name, r53ResolverEndpoints.inBoundEndpoint);
          this.outputs.set(`${vpcConfig.name}InboundEndpoint`, r53ResolverEndpoints.inBoundEndpoint)
        }

        // Adding VPC Outbound Endpoint to Output
        if (r53ResolverEndpoints.outBoundEndpoint) {
          vpcOutBoundMapping.set(vpcConfig.name, r53ResolverEndpoints.outBoundEndpoint);
          this.outputs.set(`${vpcConfig.name}OutboundEndpoint`, r53ResolverEndpoints.outBoundEndpoint)
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
        this.outputs.set(`${resolverVpc}PHZRule${madConfig['dns-domain']}`, rule.ruleId);
      }
      // Add Outputs
      // Add Public Hosted Zone to Output
      for (const [domain, phz] of r53Zones.publicZoneToDomainMap.entries()) {
        this.outputs.set(domain, phz);
      }

      // Add Private Hosted Zone to Output
      for (const [domain, phz] of r53Zones.privateZoneToDomainMap.entries()) {
        this.outputs.set(domain, phz);
      }

  }
}
function domainToName(domain: string): string {
    return domain.replace(/\./gi, '-');
}
