import * as ec2 from '@aws-cdk/aws-ec2';
import * as route53 from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';

export interface InterfaceEndpointProps {
  serviceName: string;
  vpcId: string;
  vpcRegion: string;
  subnetIds: string[];
}

/**
 * Auxiliary construct that represents all the resources needed to create a single interface endpoint. It contains a
 * SecurityGroup, VPCEndpoint, HostedZone and RecordSet.
 */
export class InterfaceEndpoint extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: InterfaceEndpointProps) {
    super(scope, id);

    const { serviceName, vpcId, vpcRegion, subnetIds } = props;

    // Create a new security groupo per endpoint
    const securityGroup = new ec2.CfnSecurityGroup(this, `ep_${serviceName}`, {
      vpcId,
      groupDescription: `AWS Private Endpoint Zone - ${serviceName}`,
      groupName: `ep_${serviceName}_sg`,
      securityGroupIngress: [
        {
          ipProtocol: ec2.Protocol.ALL,
          cidrIp: '0.0.0.0/0',
        },
        {
          ipProtocol: ec2.Protocol.ALL,
          cidrIpv6: '0::/0',
        },
      ],
      securityGroupEgress: [
        {
          ipProtocol: ec2.Protocol.ALL,
          cidrIp: '0.0.0.0/0',
        },
        {
          ipProtocol: ec2.Protocol.ALL,
          cidrIpv6: '0::/0',
        },
      ],
    });

    const endpoint = new ec2.CfnVPCEndpoint(this, 'Endpoint', {
      serviceName: interfaceVpcEndpointForRegionAndEndpointName(vpcRegion, serviceName),
      vpcEndpointType: ec2.VpcEndpointType.INTERFACE,
      vpcId,
      subnetIds,
      securityGroupIds: [securityGroup.ref],
      privateDnsEnabled: false,
    });
    endpoint.addDependsOn(securityGroup);

    const hostedZoneName = zoneNameForRegionAndEndpointName(vpcRegion, serviceName);
    const hostedZone = new route53.CfnHostedZone(this, 'Phz', {
      name: hostedZoneName,
      vpcs: [
        {
          vpcId,
          vpcRegion,
        },
      ],
      hostedZoneConfig: {
        comment: `zzEndpoint - ${serviceName}`,
      },
    });
    hostedZone.addDependsOn(endpoint);

    const recordSet = new route53.CfnRecordSet(this, 'RecordSet', {
      type: 'A',
      name: hostedZoneName,
      hostedZoneId: hostedZone.ref,
      aliasTarget: {
        // https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-route53-targets/lib/interface-vpc-endpoint-target.ts
        dnsName: cdk.Fn.select(1, cdk.Fn.split(':', cdk.Fn.select(0, endpoint.attrDnsEntries))),
        hostedZoneId: cdk.Fn.select(0, cdk.Fn.split(':', cdk.Fn.select(0, endpoint.attrDnsEntries))),
      },
    });
    recordSet.addDependsOn(hostedZone);
  }
}

function interfaceVpcEndpointForRegionAndEndpointName(region: string, name: string): string {
  if (name === 'notebook') {
    return `aws.sagemaker.${region}.${name}`;
  }
  return `com.amazonaws.${region}.${name}`;
}

function zoneNameForRegionAndEndpointName(region: string, name: string) {
  if (name === 'notebook') {
    return `notebook.${region}.sagemaker.aws.`;
  }
  return `${name}.${region}.amazonaws.com.`;
}
