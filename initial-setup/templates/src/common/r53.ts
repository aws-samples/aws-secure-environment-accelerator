import * as cdk from '@aws-cdk/core';
import * as r53 from '@aws-cdk/aws-route53';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as r53Resolver from '@aws-cdk/aws-route53resolver';

import { AcceleratorStackProps } from '@aws-pbmm/common-cdk/lib/core/accelerator-stack';
import { GlobalOptionsZonesConfig } from '@aws-pbmm/common-lambda/lib/config';

export interface StackProps extends AcceleratorStackProps {
    zonesConfig: GlobalOptionsZonesConfig;
}

export class Route53 extends cdk.Construct {

  constructor(parent: cdk.Construct, name: string, props: StackProps) {
    super(parent, name);

    const zoneConfig = props.zonesConfig;
    const publicHostedZoneProps = zoneConfig.names.public;
    const privateHostedZoneProps = zoneConfig.names.private;

    let publicZoneToDomainMap = new Map<string, string>();
    let privateZoneToDomainMap = new Map<string, string>();

    // Create Public Hosted Zones
    for(const domain of publicHostedZoneProps){
    let zone = new r53.CfnHostedZone(this, `${domain.replace('.','')}_phz`, {
        name: domain,
    });
    publicZoneToDomainMap.set(domain, zone.ref);
    }

    // Form VPC Properties for Private Hosted Zone
    const vpcProps: r53.CfnHostedZone.VPCProperty = {
    vpcId: zoneConfig["resolver-vpc"],
    vpcRegion: props.env?.region || 'ca-central-1',
    };
    
    // Create Private Hosted Zones
    for(const domain of privateHostedZoneProps){
    let zone = new r53.CfnHostedZone(this, `${domain.replace('.','')}_phz`, {
        name: domain,
        vpcs: [vpcProps]
    });
    privateZoneToDomainMap.set(domain, zone.ref);
    }

    // IpAddress for In/Out Bound Endpoints
    let ipAddress: Array<r53Resolver.CfnResolverEndpoint.IpAddressRequestProperty> = [];
    for (const subnet of zoneConfig["resolver-subnet"].split(',')) {
    ipAddress.push({
        subnetId: subnet,
    });
    }

    // Create R53 inbound Endpoint

    // Create Security Group for Inbound Endpoint
    const inScg = new ec2.CfnSecurityGroup(this, `${zoneConfig["resolver-vpc"]}_inbound_scg`, {
    groupDescription: 'Security Group for Public Hosted Zone Inbound EndpointRoute53',
    vpcId: zoneConfig["resolver-vpc"],
    groupName: `${zoneConfig["resolver-vpc"]}_inbound_scg`
    });

    // Create Inbound Resolver
    const inBoundEndpoint = new r53Resolver.CfnResolverEndpoint(this, 'DNSInBoundResolver', {
    direction: 'INBOUND',
    ipAddresses: ipAddress,
    securityGroupIds: [inScg.ref],
    });

    
    // Create R53 outbound Endpoint

    // Create Security Group for Outbound Endpoint
    const outScg = new ec2.CfnSecurityGroup(this, `${zoneConfig["resolver-vpc"]}_outbound_scg`, {
    groupDescription: 'Security Group for Public Hosted Zone Outbound EndpointRoute53',
    vpcId: zoneConfig["resolver-vpc"],
    groupName: `${zoneConfig["resolver-vpc"]}_outbound_scg`
    });

    // Create Inbound Resolver
    const outBoundEndpoint = new r53Resolver.CfnResolverEndpoint(this, 'DNSOutBoundResolver', {
    direction: 'OUTBOUND',
    ipAddresses: ipAddress,
    securityGroupIds: [outScg.ref],
    });

    
  }
}
