import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as r53resolver from '@aws-cdk/aws-route53resolver';
import { Context } from '../utils/context';
import { R53DnsEndpointIps } from '@aws-accelerator/custom-resource-r53-dns-endpoint-ips';

export interface Route53ResolverEndpointProps {
  context: Context;
  /**
   * The name that will be added to the description of the endpoint resolvers.
   */
  name: string;
  /**
   * The VPC ID to use when creating resolver endpoints.
   */
  vpcId: string;
  /**
   * The subnet IDs to use when creating resolver endpoints.
   */
  subnetIds: string[];
}

export class Route53ResolverEndpoint extends cdk.Construct {
  private _inboundEndpoint: r53resolver.CfnResolverEndpoint | undefined;
  private _outboundEndpoint: r53resolver.CfnResolverEndpoint | undefined;
  private _inboundEndpointIps: string[] = [];

  constructor(parent: cdk.Construct, id: string, private readonly props: Route53ResolverEndpointProps) {
    super(parent, id);
  }

  /**
   * Enable inbound endpoints. An custom resource will also be created to reference the inbound endpoint's IP addresses.
   */
  enableInboundEndpoint(): r53resolver.CfnResolverEndpoint {
    if (this._inboundEndpoint) {
      return this._inboundEndpoint;
    }

    // Create Security Group for Inbound Endpoint
    const securityGroup = new ec2.CfnSecurityGroup(this, `InboundSecurityGroup`, {
      groupDescription: 'Security Group for Public Hosted Zone Inbound EndpointRoute53',
      vpcId: this.props.vpcId,
      groupName: `${this.props.name}_inbound_sg`,
    });

    const ipAddresses = this.props.subnetIds.map(subnetId => ({
      subnetId,
    }));

    // Create Inbound Resolver Endpoint
    this._inboundEndpoint = new r53resolver.CfnResolverEndpoint(this, `InboundEndpoint`, {
      direction: 'INBOUND',
      ipAddresses,
      securityGroupIds: [securityGroup.ref],
      name: `${this.props.name} Inbound Endpoint`,
    });

    const dnsIps = new R53DnsEndpointIps(this, 'InboundIp', {
      resolverEndpointId: this._inboundEndpoint.ref,
    });

    // Every IP address that we supply to inbound endpoint will result in an DNS endpoint IP
    this._inboundEndpointIps = ipAddresses.map((_, index) => dnsIps.getEndpointIpAddress(index));

    return this._inboundEndpoint;
  }

  /**
   * Enable outbound endpoints.
   */
  enableOutboundEndpoint(): r53resolver.CfnResolverEndpoint {
    if (this._outboundEndpoint) {
      return this._outboundEndpoint;
    }

    // Create Security Group for Outbound Endpoint
    const securityGroup = new ec2.CfnSecurityGroup(this, `OutboundSecurityGroup`, {
      groupDescription: 'Security Group for Public Hosted Zone Outbound EndpointRoute53',
      vpcId: this.props.vpcId,
      groupName: `${this.props.name}_outbound_sg`,
    });

    const ipAddresses = this.props.subnetIds.map(subnetId => ({
      subnetId,
    }));

    // Create Outbound Resolver Endpoint
    this._outboundEndpoint = new r53resolver.CfnResolverEndpoint(this, `OutboundEndpoint`, {
      direction: 'OUTBOUND',
      ipAddresses,
      securityGroupIds: [securityGroup.ref],
      name: `${this.props.name} Outbound Endpoint`,
    });
    return this._outboundEndpoint;
  }

  get inboundEndpoint(): r53resolver.CfnResolverEndpoint | undefined {
    return this._inboundEndpoint;
  }

  get inboundEndpointRef(): string | undefined {
    return this.inboundEndpoint?.ref;
  }

  get outboundEndpoint(): r53resolver.CfnResolverEndpoint | undefined {
    return this._outboundEndpoint;
  }

  get outboundEndpointRef(): string | undefined {
    return this.outboundEndpoint?.ref;
  }

  get inboundEndpointIps(): string[] {
    // Return a copy of the list so the original one isn't mutable
    return [...this._inboundEndpointIps];
  }
}
