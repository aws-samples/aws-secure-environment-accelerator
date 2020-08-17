import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import { HandlerProperties } from '@aws-accelerator/custom-resource-ec2-vpn-tunnel-options-runtime';

const resourceType = 'Custom::EC2VpnTunnelOptions';

export interface VpnTunnelOptionsProps {
  vpnConnectionId: string;
}

export type Attribute =
  | 'CgwOutsideIpAddress1'
  | 'CgwOutsideIpAddress2'
  | 'CgwInsideIpAddress1'
  | 'CgwInsideIpAddress2'
  | 'CgwInsideNetworkMask1'
  | 'CgwInsideNetworkMask2'
  | 'CgwInsideNetworkCidr1'
  | 'CgwInsideNetworkCidr2'
  | 'CgwBgpAsn1'
  | 'CgwBgpAsn2'
  | 'VpnOutsideIpAddress1'
  | 'VpnOutsideIpAddress2'
  | 'VpnInsideIpAddress1'
  | 'VpnInsideIpAddress2'
  | 'VpnInsideNetworkMask1'
  | 'VpnInsideNetworkMask2'
  | 'VpnInsideNetworkCidr1'
  | 'VpnInsideNetworkCidr2'
  | 'VpnBgpAsn1'
  | 'VpnBgpAsn2'
  | 'PreSharedKey1'
  | 'PreSharedKey2';

/**
 * Custom resource that has an VPN tunnel options attribute for the VPN connection with the given ID.
 */
export class VpnTunnelOptions extends cdk.Construct {
  private readonly resource: cdk.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: VpnTunnelOptionsProps) {
    super(scope, id);

    const lambdaPath = require.resolve('@aws-accelerator/custom-resource-ec2-vpn-tunnel-options-runtime');
    const lambdaDir = path.dirname(lambdaPath);

    const provider = cdk.CustomResourceProvider.getOrCreate(this, resourceType, {
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_12,
      codeDirectory: lambdaDir,
      policyStatements: [
        new iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['*'],
        }).toJSON(),
        new iam.PolicyStatement({
          actions: ['ec2:DescribeVpnConnections'],
          resources: ['*'],
        }).toJSON(),
      ],
    });

    const handlerProperties: HandlerProperties = {
      VPNConnectionID: props.vpnConnectionId,
    };

    this.resource = new cdk.CustomResource(this, 'Resource', {
      resourceType,
      serviceToken: provider,
      properties: handlerProperties,
    });
  }

  /**
   * Returns the given CloudFormation attribute.
   */
  getAttString(attribute: Attribute) {
    return this.resource.getAttString(attribute);
  }
}
