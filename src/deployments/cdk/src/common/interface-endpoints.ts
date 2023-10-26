/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface InterfaceEndpointProps {
  serviceName: string;
  vpcId: string;
  vpcRegion: string;
  subnetIds: string[];
  allowedCidrs?: string[];
  ports?: string[];
}

enum ProtocolPrefix {
  TCP = 'TCP:',
  UDP = 'UDP:',
  ICMP = 'ICMP:',
}

/**
 * Auxiliary construct that represents all the resources needed to create a single interface endpoint. It contains a
 * SecurityGroup, VPCEndpoint, HostedZone and RecordSet.
 */
export class InterfaceEndpoint extends Construct {
  private _hostedZone: route53.CfnHostedZone;
  constructor(scope: Construct, id: string, props: InterfaceEndpointProps) {
    super(scope, id);

    const { serviceName, vpcId, vpcRegion, subnetIds, allowedCidrs, ports } = props;
    const securityGroupIngress: ec2.CfnSecurityGroup.IngressProperty[] = [];
    for (const ingressCidr of allowedCidrs || ['0.0.0.0/0']) {
      for (const endpointPort of ports || ['TCP:443']) {
        let ipProtocol: ec2.Protocol;
        let port: number;
        if (endpointPort.startsWith(ProtocolPrefix.TCP)) {
          port = parseInt(endpointPort.split(ProtocolPrefix.TCP).pop()!, 10);
          ipProtocol = ec2.Protocol.TCP;
        } else if (endpointPort.startsWith(ProtocolPrefix.UDP)) {
          port = parseInt(endpointPort.split(ProtocolPrefix.UDP).pop()!, 10);
          ipProtocol = ec2.Protocol.UDP;
        } else if (endpointPort.startsWith(ProtocolPrefix.ICMP)) {
          port = parseInt(endpointPort.split(ProtocolPrefix.ICMP).pop()!, 10);
          ipProtocol = ec2.Protocol.ICMP;
        } else {
          port = 443;
          ipProtocol = ec2.Protocol.TCP;
        }
        securityGroupIngress.push({
          ipProtocol,
          cidrIp: ingressCidr,
          toPort: port,
          fromPort: port,
        });
      }
    }
    // Create a new security groupo per endpoint
    const securityGroup = new ec2.CfnSecurityGroup(this, `ep_${serviceName}`, {
      vpcId,
      groupDescription: `AWS Private Endpoint Zone - ${serviceName}`,
      groupName: `ep_${serviceName}_sg`,
      securityGroupIngress,
      // Adding Egress '127.0.0.1/32' to avoid default Egress rule
      securityGroupEgress: [
        {
          ipProtocol: ec2.Protocol.ALL,
          cidrIp: '127.0.0.1/32',
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
    endpoint.addDependency(securityGroup);

    const hostedZoneName = zoneNameForRegionAndEndpointName(vpcRegion, serviceName);
    this._hostedZone = new route53.CfnHostedZone(this, 'Phz', {
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

    this._hostedZone.addDependency(endpoint);

    const recordSetName = recordSetNameForRegionAndEndpointName(vpcRegion, serviceName);
    const recordSet = new route53.CfnRecordSet(this, 'RecordSet', {
      type: 'A',
      name: recordSetName,
      hostedZoneId: this._hostedZone.ref,
      aliasTarget: aliasTargetForServiceNameAndEndpoint(serviceName, endpoint),
    });
    recordSet.addDependency(this._hostedZone);
  }

  get hostedZone(): route53.CfnHostedZone {
    return this._hostedZone;
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
  if (name.indexOf('.') > 0) {
    const tmp = name.split('.').reverse().join('.');
    return `${tmp}.${region}.amazonaws.com.`;
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

function recordSetNameForRegionAndEndpointName(region: string, name: string) {
  const hostedZoneName = zoneNameForRegionAndEndpointName(region, name);

  if (name === 'ecr.dkr') {
    return `*.${hostedZoneName}`;
  }

  return hostedZoneName;
}
