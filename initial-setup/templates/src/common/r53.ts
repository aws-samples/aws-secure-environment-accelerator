import * as cdk from '@aws-cdk/core';
import * as r53 from '@aws-cdk/aws-route53';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as r53Resolver from '@aws-cdk/aws-route53resolver';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as lambda from '@aws-cdk/aws-lambda';

import { AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { AcceleratorConfig, VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Context } from '../utils/context';
import { StackOutputs } from '../utils/outputs';
import { getStackOutput } from '../utils/outputs';


export interface StackProps extends AcceleratorStackProps {
  acceleratorConfig: AcceleratorConfig;
  context: Context;
  outputs: StackOutputs
}

interface ruleTargetIps {
  ip : string,
  port: string
}

export class Route53 extends cdk.Construct {
  constructor(parent: cdk.Construct, name: string, props: StackProps) {
    super(parent, name);

    const zoneConfig = props.acceleratorConfig["global-options"].zones;
    const mandatoryAccountConfig = props.acceleratorConfig['mandatory-account-configs'];
    
    const publicHostedZoneProps = zoneConfig.names.public;
    const privateHostedZoneProps = zoneConfig.names.private;

    let publicZoneToDomainMap = new Map<string, string>();
    let privateZoneToDomainMap = new Map<string, string>();

    // Create Public Hosted Zones
    for (const domain of publicHostedZoneProps) {
      let zone = new r53.CfnHostedZone(this, `${domain.replace('.', '')}_phz`, {
        name: domain,
      });
      publicZoneToDomainMap.set(domain, zone.ref);
    }

    const zoneEndpointVpcId = getStackOutput(props.outputs, zoneConfig.account, `Vpc${zoneConfig["resolver-vpc"]}`)
    // Form VPC Properties for Private Hosted Zone
    const vpcProps: r53.CfnHostedZone.VPCProperty = {
      vpcId: zoneEndpointVpcId,
      vpcRegion: props.env?.region || 'ca-central-1',
    };

    // Create Private Hosted Zones
    for (const domain of privateHostedZoneProps) {
      let zone = new r53.CfnHostedZone(this, `${domain.replace('.', '')}_phz`, {
        name: domain,
        vpcs: [vpcProps],
      });
      privateZoneToDomainMap.set(domain, zone.ref);
    }

    const mandatoryAccounts: Array<string> = Object.keys(mandatoryAccountConfig);
    for ( const account of mandatoryAccounts){
      const accountConfig = (mandatoryAccountConfig as any)[account];
      const vpcConfig = accountConfig.vpc! as VpcConfig;
      if (!vpcConfig) continue; // Ignore if no VPC Config specified
      const resolvers = vpcConfig.resolvers;
      if(!resolvers) continue; // Ignore if no resolvers for VPC
      const endpointSubnet = vpcConfig.subnets?.find(x => x.name === resolvers?.subnet);
      if(!endpointSubnet){
        console.error(`Subnet provided in resolvers doesn't exist in Subnet = ${resolvers.subnet} and VPC = ${vpcConfig.name}`);
        continue;
      }
      const subnetDefinitions = endpointSubnet?.definitions;
      let ipAddress: Array<r53Resolver.CfnResolverEndpoint.IpAddressRequestProperty> = [];
      if(!subnetDefinitions){
        console.error(`No Subnets definitions defined for ${resolvers.subnet}`);
        continue;
      }
      for(const [key, subnet] of subnetDefinitions.entries()){
        if (subnet.disabled){
          continue;
        }
        ipAddress.push({
          subnetId: getStackOutput(props.outputs, zoneConfig.account, `${vpcConfig.name}Subnet${endpointSubnet?.name}az${key + 1}`)
        });
      }

      if (resolvers?.inbound){
        // Create Security Group for Inbound Endpoint
        const scg = new ec2.CfnSecurityGroup(this, `${vpcConfig.name}_inbound_sg`, {
          groupDescription: 'Security Group for Public Hosted Zone Inbound EndpointRoute53',
          vpcId: getStackOutput(props.outputs, "shared-network", `Vpc${vpcConfig.name}`),
          groupName: `${vpcConfig.name}_inbound_sg`,
        });

        // Create Inbound Resolver Endpoint
        const inBoundEndpoint = new r53Resolver.CfnResolverEndpoint(this, `${resolvers.subnet}_inbound_endpoint`, {
          direction: 'INBOUND',
          ipAddresses: ipAddress,
          securityGroupIds: [scg.ref],
        });

      }

      if (resolvers?.outbound){
        // Create Security Group for Outbound Endpoint
        const scg = new ec2.CfnSecurityGroup(this, `${vpcConfig.name}_outbound_sg`, {
          groupDescription: 'Security Group for Public Hosted Zone Outbound EndpointRoute53',
          vpcId: getStackOutput(props.outputs, "shared-network", `Vpc${vpcConfig.name}`),
          groupName: `${vpcConfig.name}_outbound_sg`,
        });

        // Create Outbound Resolver Endpoint
        const outBoundEndpoint = new r53Resolver.CfnResolverEndpoint(this, `${resolvers.subnet}_outbound_endpoint`, {
          direction: 'OUTBOUND',
          ipAddresses: ipAddress,
          securityGroupIds: [scg.ref],
        });

        const lambdaFnc = lambda.Function.fromFunctionArn(this, 'CfnLambda', props.context.cfnDnsEndopintIpsLambdaArn);
        
        const outboundIpPooler = new cfn.CustomResource(this, 'OutBoundIPPooler', {
          provider: cfn.CustomResourceProvider.lambda(lambdaFnc),
          properties: {
            EndpointResolver: outBoundEndpoint.ref,
            AccountId: props.env?.account
          },
        });
        const outBountEndpointIps = outboundIpPooler.getAtt('Ips');
        const ips = cdk.Fn.split(',', outBountEndpointIps.toString());
        const ruletargetIps: Array<r53Resolver.CfnResolverRule.TargetAddressProperty> = [];
        for( const ip of ips){
          ruletargetIps.push({
            ip,
            port: '53'
          });
        }
        const inCloudPrivateRule = new r53Resolver.CfnResolverRule(this, 'InCloudPrivateRule', {
          domainName: privateHostedZoneProps[0],
          ruleType: 'FORWARD',
          resolverEndpointId: outBoundEndpoint.ref,
          name: 'InCloudPrivateRule',
          targetIps: ruletargetIps,
        });
      }
    }
  }
}
