import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as r53Resolver from '@aws-cdk/aws-route53resolver';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as lambda from '@aws-cdk/aws-lambda';

import { VpcConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Context } from '../utils/context';
import { StackOutputs, getStackOutput } from '../utils/outputs';

export interface Route53ResolverEndpointProps {
  vpcConfig: VpcConfig;
  context: Context;
  outputs: StackOutputs;
  accountId: string;
  accountName: string;
}

export class Route53ResolverEndpoint extends cdk.Construct {
  readonly inBoundEndpoint: string = '';
  readonly outBoundEndpoint: string = '';
  readonly inBoundEndpointIps: string = '';
  readonly outBoundEndpointIps: string = '';
  constructor(parent: cdk.Construct, name: string, props: Route53ResolverEndpointProps) {
    super(parent, name);
    const vpcConfig = props.vpcConfig;
    const resolvers = vpcConfig.resolvers!;
    const endpointSubnet = vpcConfig.subnets?.find(x => x.name === resolvers?.subnet);
    const accountName = vpcConfig.deploy === 'local' ? props.accountName : vpcConfig.deploy;
    const vpcId = getStackOutput(props.outputs, accountName!, `Vpc${vpcConfig.name}`);
    if (!endpointSubnet) {
      console.error(
        `Subnet provided in resolvers doesn't exist in Subnet = ${resolvers.subnet} and VPC = ${vpcConfig.name}`,
      );
      return;
    }
    const subnetDefinitions = endpointSubnet?.definitions;
    if (!subnetDefinitions) {
      console.error(`No Subnets definitions defined for ${resolvers.subnet}`);
      return;
    }
    let ipAddress: Array<r53Resolver.CfnResolverEndpoint.IpAddressRequestProperty> = [];
    for (const [key, subnet] of subnetDefinitions.entries()) {
      if (subnet.disabled) {
        continue;
      }
      ipAddress.push({
        subnetId: getStackOutput(
          props.outputs,
          accountName!,
          `${vpcConfig.name}Subnet${endpointSubnet?.name}az${key + 1}`,
        ),
      });
    }
    let vpcInSg, vpcOutSg, inBoundEndpoint, outBoundEndpoint;
    if (resolvers?.inbound) {
      // Create Security Group for Inbound Endpoint
      vpcInSg = new ec2.CfnSecurityGroup(this, `${vpcConfig.name}_inbound_sg`, {
        groupDescription: 'Security Group for Public Hosted Zone Inbound EndpointRoute53',
        vpcId: vpcId,
        groupName: `${vpcConfig.name}_inbound_sg`,
      });

      // Create Inbound Resolver Endpoint
      inBoundEndpoint = new r53Resolver.CfnResolverEndpoint(this, `${resolvers.subnet}_inbound_endpoint`, {
        direction: 'INBOUND',
        ipAddresses: ipAddress,
        securityGroupIds: [vpcInSg.ref],
        name: `${vpcConfig.name} Inbound Endpoint`,
      });
      this.inBoundEndpoint = inBoundEndpoint.ref;
    }

    if (resolvers?.outbound) {
      // Create Security Group for Outbound Endpoint
      vpcOutSg = new ec2.CfnSecurityGroup(this, `${vpcConfig.name}_outbound_sg`, {
        groupDescription: 'Security Group for Public Hosted Zone Outbound EndpointRoute53',
        vpcId: vpcId,
        groupName: `${vpcConfig.name}_outbound_sg`,
      });

      // Create Outbound Resolver Endpoint
      outBoundEndpoint = new r53Resolver.CfnResolverEndpoint(this, `${resolvers.subnet}_outbound_endpoint`, {
        direction: 'OUTBOUND',
        ipAddresses: ipAddress,
        securityGroupIds: [vpcOutSg.ref],
        name: `${vpcConfig.name} Outbound Endpoint`,
      });
      this.outBoundEndpoint = outBoundEndpoint.ref;
    }

    if (inBoundEndpoint) {
      const lambdaFnc = lambda.Function.fromFunctionArn(
        this,
        'CfnInBoundEndpointIpPooler',
        props.context.cfnDnsEndopintIpsLambdaArn,
      );
      // Create CfnCustom Resource to get IPs which are alloted to InBound Endpoint
      const inBoundIpPooler = new cfn.CustomResource(this, 'InBoundIPPooler', {
        provider: cfn.CustomResourceProvider.lambda(lambdaFnc),
        properties: {
          EndpointResolver: inBoundEndpoint.ref,
          AccountId: props.accountId,
        },
      });

      let targetIps: Array<string> = [''];
      for (let i = 1; i <= ipAddress.length; i++) {
        targetIps.push(inBoundIpPooler.getAttString(`IpAddress${i}`));
      }
      this.inBoundEndpointIps = targetIps.join(',');
    }

    if (outBoundEndpoint) {
      const lambdaFnc = lambda.Function.fromFunctionArn(
        this,
        'CfnOuBoundEndpointIpPooler',
        props.context.cfnDnsEndopintIpsLambdaArn,
      );
      // Create CfnCustom Resource to get IPs which are alloted to InBound Endpoint
      const outBoundIpPooler = new cfn.CustomResource(this, 'OutBoundIPPooler', {
        provider: cfn.CustomResourceProvider.lambda(lambdaFnc),
        properties: {
          EndpointResolver: outBoundEndpoint.ref,
          AccountId: props.accountId,
        },
      });

      let targetIps: Array<string> = [''];
      for (let i = 1; i <= ipAddress.length; i++) {
        targetIps.push(outBoundIpPooler.getAttString(`IpAddress${i}`));
      }
      this.outBoundEndpointIps = targetIps.join(',');
    }
  }
}
