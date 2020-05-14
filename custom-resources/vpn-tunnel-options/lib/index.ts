import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as cfn from '@aws-cdk/aws-cloudformation';
import * as iam from '@aws-cdk/aws-iam';
import * as lambda from '@aws-cdk/aws-lambda';

export interface VpnTunnelOptionsProps {
  vpnConnectionId: string;
  roleName: string;
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
  private readonly props: VpnTunnelOptionsProps;
  // tslint:disable-next-line: deprecation
  private readonly resource: cfn.CustomResource;

  constructor(scope: cdk.Construct, id: string, props: VpnTunnelOptionsProps) {
    super(scope, id);
    this.props = props;

    // Create CfnCustom Resource to get IPs which are alloted to InBound Endpoint
    // tslint:disable-next-line: deprecation
    this.resource = new cfn.CustomResource(this, 'Resource', {
      provider: cfn.CustomResourceProvider.fromLambda(this.ensureLambda()),
      properties: {
        VPNConnectionID: props.vpnConnectionId,
      },
    });
  }

  private ensureLambda(): lambda.Function {
    const constructName = 'VpnTunnelOptionsLambda';

    const stack = cdk.Stack.of(this);
    const existing = stack.node.tryFindChild(constructName);
    if (existing) {
      return existing as lambda.Function;
    }

    const imageFinderRole = new iam.Role(stack, 'Role', {
      roleName: this.props.roleName,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Grant permissions to write logs
    imageFinderRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    imageFinderRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ec2:DescribeVpnConnections'],
        resources: ['*'],
      }),
    );

    // Resolve the path of the Lambda function
    const lambdaPath = require.resolve('@custom-resources/ec2-vpn-tunnel-options-lambda');
    const lambdaDir = path.dirname(lambdaPath);

    return new lambda.Function(stack, constructName, {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset(lambdaDir),
      handler: 'index.handler',
      role: imageFinderRole,
    });
  }

  /**
   * Returns the given CloudFormation attribute.
   */
  getAttribute(attribute: Attribute) {
    return this.resource.getAttString(attribute);
  }
}
