# EC2 VPN Tunnel Options

This is a custom resource to find VPN connection tunnel options by using the EC2 `DescribeVpnConnections` API call.

## Usage

    import { VpnTunnelOptions } from '@aws-accelerator/custom-resource-ec2-vpn-tunnel-options';

    const tunnelOptions = new VpnTunnelOptions(scope, 'TunnelOptions', {
      vpnConnectionId: 'vpn-0123456789',
    });

    tunnelOptions.getAttribute('CgwOutsideIpAddress1');
    tunnelOptions.getAttribute('CgwOutsideIpAddress2');
