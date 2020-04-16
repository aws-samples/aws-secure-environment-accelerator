import * as cloudformation from '@aws-cdk/aws-cloudformation';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as route53 from '@aws-cdk/aws-route53';
import * as cdk from '@aws-cdk/core';
import { AccountConfig, InterfaceEndpointConfig } from '@aws-pbmm/common-lambda/lib/config';
import { bgRed } from 'colors/safe';
import * as t from 'io-ts';
import { Vpc } from './vpc';

interface InterfaceEndpointProps {
  serviceName: string;
  vpcId: string;
  vpcRegion: string;
  subnetIds: string[];
}

/**
 * Auxiliary construct that represents all the resources needed to create a single interface endpoint. It contains a
 * SecurityGroup, VPCEndpoint, HostedZone and RecordSet.
 */
class InterfaceEndpoint extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: InterfaceEndpointProps) {
    super(scope, id);

    const { serviceName, vpcId, vpcRegion, subnetIds } = props;

    // Create a new security groupo per endpoint
    const securityGroup = new ec2.CfnSecurityGroup(this, serviceName, {
      vpcId,
      groupDescription: `AWS Private Endpoint Zone - ${serviceName}`,
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
        comment: `AWS Private Endpoint Zone - ${serviceName}`,
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

export interface InterfaceEndpointsProps {
  vpc: Vpc;
  accountConfig: AccountConfig;
}

/**
 * Construct that creates the interface endpoints for the given `vpc` and `accountConfig`.
 */
export class InterfaceEndpoints extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: InterfaceEndpointsProps) {
    super(scope, id);

    const { vpc, accountConfig } = props;

    const vpcConfig = accountConfig.vpc!;
    const vpcRegion = vpcConfig.region;
    if (!t.string.is(vpcRegion)) {
      console.log('Skipping interface endpoint as "region" is not set');
      return;
    }

    const interfaceEndpointConfig = vpcConfig['interface-endpoints'];
    if (!InterfaceEndpointConfig.is(interfaceEndpointConfig)) {
      console.log('Skipping interface endpoint as "interface-endpoints" is not set');
      return;
    }

    if (!t.string.is(interfaceEndpointConfig.subnet)) {
      console.log('Skipping interface endpoint as "subnet" is not set');
      return;
    }

    const subnetName = interfaceEndpointConfig.subnet;
    const subnetIds = vpc.azSubnets.get(subnetName);
    if (!subnetIds) {
      throw new Error(`Cannot find subnet ID with name "${subnetName}'`);
    }

    const interfaceEndpoints = interfaceEndpointConfig?.endpoints || [];

    // TODO Support Sagemaker Notebook endpoint
    if (interfaceEndpoints.includes('notebook')) {
      const message = 'The "notebook" interface endpoint is currently not supported.';
      console.error(bgRed(message));
      throw new Error(message);
    }

    // TODO Load the quotas from service quotas
    if (interfaceEndpoints.length > 50) {
      const message = 'Deploying more than 50 interface endpoints is currently not supported.';
      console.error(bgRed(message));
      throw new Error(message);
    }

    // Group the interface endpoints by groups of 30 and create a stack for each group
    let index = 0;
    for (const groupedEndpoints of groupArrayByLength<string>(interfaceEndpoints, 30)) {
      const nested = new cloudformation.NestedStack(this, `InterfaceEndpoints${index++}`);
      for (const serviceName of groupedEndpoints) {
        new InterfaceEndpoint(nested, serviceName, {
          serviceName,
          vpcId: vpc.vpcId,
          vpcRegion,
          subnetIds,
        });
      }
    }
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

/**
 * Group the given array in subarrays with a maximum length.
 *
 * @param array The array that should be grouped
 * @param length The maximum length of the result groups
 */
function groupArrayByLength<T>(array: T[], length: number): T[][] {
  return array.reduce((result: T[][], value) => {
    let lastSubArray: T[] | undefined = result[result.length - 1];
    if (!lastSubArray || lastSubArray.length >= length) {
      lastSubArray = [];
      result.push(lastSubArray);
    }
    lastSubArray.push(value);
    return result;
  }, []);
}
