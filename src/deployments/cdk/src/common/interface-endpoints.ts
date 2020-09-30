import * as ec2 from '@aws-cdk/aws-ec2';
import * as route53 from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';
import { CreateHostedZone } from '@aws-accelerator/custom-resource-create-hosted-zone';
import { domain } from 'process';

export interface InterfaceEndpointProps {
  serviceName: string;
  vpcId: string;
  vpcRegion: string;
  subnetIds: string[];
  roleArn: string;
}

/**
 * Auxiliary construct that represents all the resources needed to create a single interface endpoint. It contains a
 * SecurityGroup, VPCEndpoint, HostedZone and RecordSet.
 */
export class InterfaceEndpoint extends cdk.Construct {
  private _hostedZone: CreateHostedZone;
  private _hostedZoneName: string;
  constructor(scope: cdk.Construct, id: string, props: InterfaceEndpointProps) {
    super(scope, id);

    const { serviceName, vpcId, vpcRegion, subnetIds, roleArn } = props;

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

    this._hostedZoneName = zoneNameForRegionAndEndpointName(vpcRegion, serviceName);
    // this._hostedZone = new route53.CfnHostedZone(this, 'Phz', {
    //   name: hostedZoneName,
    //   vpcs: [
    //     {
    //       vpcId,
    //       vpcRegion,
    //     },
    //   ],
    //   hostedZoneConfig: {
    //     comment: `zzEndpoint - ${serviceName}`,
    //   },
    // });

    this._hostedZone = new CreateHostedZone(this, 'Phz', {
      domain: this._hostedZoneName,
      comment: `zzEndpoint - ${serviceName}`,
      region: vpcRegion,
      roleArn,
      vpcId,
    });

    this._hostedZone.node.addDependency(endpoint);

    const recordSet = new route53.CfnRecordSet(this, 'RecordSet', {
      type: 'A',
      name: this._hostedZoneName,
      hostedZoneId: this._hostedZone.zoneId,
      aliasTarget: aliasTargetForServiceNameAndEndpoint(serviceName, endpoint),
    });
    recordSet.node.addDependency(this._hostedZone);
  }

  get hostedZone(): { name: string; id: string } {
    return {
      name: this._hostedZone.zoneId,
      id: this._hostedZoneName,
    };
  }
}

function aliasTargetForServiceNameAndEndpoint(serviceName: string, endpoint: ec2.CfnVPCEndpoint) {
  const dnsEntriesIndex = getZoneAliasTargetIndex(serviceName);
  return {
    // https://github.com/aws/aws-cdk/blob/master/packages/%40aws-cdk/aws-route53-targets/lib/interface-vpc-endpoint-target.ts
    dnsName: cdk.Fn.select(1, cdk.Fn.split(':', cdk.Fn.select(dnsEntriesIndex, endpoint.attrDnsEntries))),
    hostedZoneId: cdk.Fn.select(0, cdk.Fn.split(':', cdk.Fn.select(dnsEntriesIndex, endpoint.attrDnsEntries))),
  };
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

function getZoneAliasTargetIndex(name: string): number {
  if (name === 'notebook') {
    // TODO Top 3 DNS names are not valid so selecting the 4th DNS
    // need to find a better way to identify the valid DNS for PHZ
    return 4;
  }
  return 0;
}
