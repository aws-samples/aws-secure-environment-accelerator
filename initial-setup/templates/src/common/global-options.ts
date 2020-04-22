import * as cdk from '@aws-cdk/core';
import { AcceleratorConfig, VpcConfig, AccountConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Account } from '../utils/accounts';
import { Context } from '../utils/context';
import { Route53Zones } from './r53-zones';
import { Route53ResolverEndpoint } from './r53-resolver-endpoint';
import { Route53ResolverRule } from './r53-resolver-rule';
import { StackOutput, getStackJsonOutput, getStackOutput } from '@aws-pbmm/common-lambda/lib/util/outputs';
import { VpcOutput } from '../apps/phase-1';

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
  outputs: StackOutput[];
}

/**
 * Auxiliary construct that creates VPCs for organizational units.
 */
export class GlobalOptionsDeployment extends cdk.Construct {
  /**
   * We should store the relevant constructs that are created instead of storing outputs.
   * @deprecated
   */
  readonly outputs = new Map<string, string>();

  constructor(scope: cdk.Construct, id: string, props: GlobalOptionsProps) {
    super(scope, id);

    const { acceleratorConfig, outputs } = props;

    const vpcInBoundMapping = new Map<string, string>();
    const vpcOutBoundMapping = new Map<string, string>();

    const zonesConfig = acceleratorConfig['global-options'].zones;
    const zonesAccountKey = zonesConfig.account;
    const zonesResolverVpcName = zonesConfig['resolver-vpc'];

    // Find the VPC config in the given account
    const zonesVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
      accountKey: zonesAccountKey,
      outputType: 'VpcOutput',
    });

    // Find the VPC in with the given name in the zones account
    const resolverVpc = zonesVpcOutputs.find(output => output.vpcName === zonesResolverVpcName);
    if (!resolverVpc) {
      throw new Error(`Cannot find resolver VPC with name "${zonesResolverVpcName}"`);
    }

    // Creating Hosted Zones based on config
    const r53Zones = new Route53Zones(this, 'DNSResolvers', {
      zonesConfig,
      vpcId: resolverVpc.vpcId,
      vpcRegion: cdk.Aws.REGION,
    });

    // Auxiliary method to create a resolvers in the account with given account key
    const createResolvers = (accountKey: string, vpcConfig: VpcConfig) => {
      const resolversConfig = vpcConfig.resolvers;
      if (!resolversConfig) {
        console.debug(`Skipping resolver creation for VPC "${vpcConfig.name}" in account "${accountKey}"`);
        return;
      }
      const vpcSubnet = vpcConfig.subnets?.find(s => s.name === resolversConfig.subnet);
      if (!vpcSubnet) {
        throw new Error(
          `Subnet provided in resolvers doesn't exist in Subnet = ${resolversConfig.subnet} and VPC = ${vpcConfig.name}`,
        );
      }

      const vpcOutputs: VpcOutput[] = getStackJsonOutput(props.outputs, {
        accountKey,
        outputType: 'VpcOutput',
      });
      const vpcOutput = vpcOutputs.find(output => output.vpcName === vpcConfig.name);
      if (!vpcOutput) {
        throw new Error(`Cannot find resolved VPC with name "${vpcConfig.name}"`);
      }
      const subnetIds = vpcOutput.subnets.filter(s => s.subnetName === resolversConfig.subnet).map(s => s.subnetId);
      if (subnetIds.length === 0) {
        throw new Error(
          `Cannot find subnet IDs for subnet name = ${resolversConfig.subnet} and VPC = ${vpcConfig.name}`,
        );
      }

      // Call r53-resolver-endpoint per Account
      const r53ResolverEndpoints = new Route53ResolverEndpoint(this, 'ResolverEndpoints', {
        context: props.context,
        vpcId: vpcOutput.vpcId,
        name: vpcConfig.name,
        subnetIds,
      });

      if (resolversConfig.inbound) {
        r53ResolverEndpoints.enableInboundEndpoint();
      }

      if (resolversConfig.outbound) {
        r53ResolverEndpoints.enableOutboundEndpoint();

        // For each on-premise domain defined in the parameters file, create a Resolver rule which points to the specified IP's
        for (const onPremRuleConfig of vpcConfig['on-premise-rules'] || []) {
          const rule = new Route53ResolverRule(this, `${domainToName(onPremRuleConfig.zone)}-on-prem-phz-rule`, {
            domain: onPremRuleConfig.zone,
            endpoint: r53ResolverEndpoints.outboundEndpointRef,
            ipAddresses: onPremRuleConfig['outbound-ips'],
            ruleType: 'FORWARD',
            name: `${domainToName(onPremRuleConfig.zone)}-phz-rule`,
            vpcId: vpcOutput.vpcId,
          });
          rule.node.addDependency(r53ResolverEndpoints);
        }
      }

      // For each Private hosted Zone created in 1) above, create a Resolver rule which points to the Inbound-Endpoint-IP's
      if (r53ResolverEndpoints.inboundEndpointRef && r53ResolverEndpoints.outboundEndpointRef) {
        for (const [domain, _] of r53Zones.privateZoneToDomainMap.entries()) {
          const rule = new Route53ResolverRule(this, `${domainToName(domain)}-phz-rule`, {
            domain,
            endpoint: r53ResolverEndpoints.outboundEndpointRef,
            ipAddresses: r53ResolverEndpoints.inboundEndpointIps,
            ruleType: 'FORWARD',
            name: `${domainToName(domain)}-phz-rule`,
            vpcId: vpcOutput.vpcId,
          });
          rule.node.addDependency(r53ResolverEndpoints);
        }
      }

      // Adding VPC Inbound Endpoint to Output
      if (r53ResolverEndpoints.inboundEndpointRef) {
        vpcInBoundMapping.set(vpcConfig.name, r53ResolverEndpoints.inboundEndpointRef);
      }

      // Adding VPC Outbound Endpoint to Output
      if (r53ResolverEndpoints.outboundEndpointRef) {
        vpcOutBoundMapping.set(vpcConfig.name, r53ResolverEndpoints.outboundEndpointRef);
      }
    };

    // Create resolvers for all mandatory account config
    const mandatoryAccountConfig = props.acceleratorConfig['mandatory-account-configs'];
    for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
      const vpcConfig = accountConfig?.vpc;
      if (!vpcConfig) {
        console.log(`Skipping resolvers creation for account "${accountKey}"`);
        continue;
      }
      if (vpcConfig.deploy !== 'local') {
        console.warn(`Skipping non-local resolvers deployment for mandatory account "${accountKey}"`);
        continue;
      }

      console.debug(`Deploying resolvers in account "${accountKey}"`);
      createResolvers(accountKey, vpcConfig);
    }

    // Create resolvers for all organizational unit config
    const organizationalUnitsConfig = props.acceleratorConfig['organizational-units'];
    for (const [ouKey, ouConfig] of Object.entries(organizationalUnitsConfig)) {
      const vpcConfig = ouConfig?.vpc;
      if (!vpcConfig) {
        console.log(`Skipping resolvers creation for organizational unit "${ouKey}"`);
        continue;
      }
      if (!vpcConfig.deploy) {
        console.warn(`Skipping resolvers creation for organizational unit "${ouKey}" as 'deploy' is not set`);
        continue;
      }

      if (vpcConfig.deploy === 'local') {
        // If the deployment is 'local' then the resolvers should be created in all the accounts in this OU
        for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
          if (accountConfig.ou === ouKey) {
            console.debug(`Deploying local resolvers for organizational unit "${ouKey}" in account "${accountKey}"`);

            createResolvers(ouKey, vpcConfig);
          }
        }
      } else {
        // If the deployment is not 'local' then the resolvers should be created in the given account
        const accountKey = vpcConfig.deploy;
        console.debug(`Deploying non-local resolvers for organizational unit "${ouKey}" in account "${accountKey}"`);

        createResolvers(vpcConfig.deploy, vpcConfig);
      }
    }

    // Check for MAD deployment, If already deployed then create Resolver Rule for MAD IPs
    for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
      const deploymentConfig = accountConfig.deployments;
      if (!deploymentConfig || !deploymentConfig.mad) {
        console.debug(`Skipping MAD deployment for account "${accountKey}"`);
        continue;
      }

      const madConfig = deploymentConfig.mad;
      let madIPs: string[];
      try {
        // TODO Get correct stack output
        const madIPCsv = getStackOutput(
          props.outputs,
          accountKey,
          `MADIPs${madConfig['dns-domain'].replace(/\./gi, '')}`,
        );
        madIPs = madIPCsv.split(',');
      } catch (error) {
        console.warn(`MAD is not deployed yet in account ${accountKey}`);
        continue;
      }

      const centralResolverAccount = madConfig['central-resolver-rule-account'];
      const centralResolverVpcName = madConfig['central-resolver-rule-vpc'];

      const centralResolverVpcOutputs: VpcOutput[] = getStackJsonOutput(outputs, {
        accountKey: centralResolverAccount,
        outputType: 'VpcOutput',
      });
      const centralResolverVpc = centralResolverVpcOutputs.find(output => output.vpcName === centralResolverVpcName);
      if (!centralResolverVpc) {
        throw new Error(`Cannot find resolved VPC with name "${centralResolverVpcName}"`);
      }
      const endpointId = vpcOutBoundMapping.get(centralResolverVpc.vpcId);
      if (!endpointId) {
        throw new Error(`Cannot find outbound mapping for VPC with name "${centralResolverVpcName}"`);
      }

      new Route53ResolverRule(this, `${domainToName(madConfig['dns-domain'])}-phz-rule`, {
        domain: madConfig['dns-domain'],
        endpoint: endpointId,
        ipAddresses: madIPs,
        ruleType: 'FORWARD',
        name: `${domainToName(madConfig['dns-domain'])}-mad-phz-rule`,
        vpcId: resolverVpc.vpcId,
      });
    }
  }
}

function domainToName(domain: string): string {
  return domain.replace(/\./gi, '-');
}
