import * as AWS from 'aws-sdk';
import * as xml2js from 'xml2js';
import { Context, CloudFormationCustomResourceEvent } from 'aws-lambda';
import { send, SUCCESS, FAILED } from 'cfn-response-async';

const ec2 = new AWS.EC2();

export const handler = async (event: CloudFormationCustomResourceEvent, context: Context): Promise<unknown> => {
  console.log(`Finding tunnel options...`);
  console.log(JSON.stringify(event, null, 2));

  const resourceId = 'VpnConnectionTunnelOptions';
  const requestType = event.RequestType;
  if (requestType === 'Delete') {
    console.log('Nothing to perform to delete this resource');
    return send(event, context, SUCCESS, {}, resourceId);
  }

  try {
    // Find VPN connection by its ID
    const describeVpnConnections = await ec2
      .describeVpnConnections({
        VpnConnectionIds: [event.ResourceProperties.VPNConnectionID],
      })
      .promise();

    const connections = describeVpnConnections.VpnConnections;
    if (!connections || connections.length === 0) {
      throw new Error(`Unable to find VPN connection`);
    }

    // The connection.Options.TunnelOptions is empty so we have to parse XML result
    const connection = connections[0];
    const configuration = await xml2js.parseStringPromise(connection.CustomerGatewayConfiguration!, {
      preserveChildrenOrder: true,
    });

    // Build the resource output
    let index = 1;
    const output: { [key: string]: string | undefined } = {};
    for (const tunnel of configuration.vpn_connection.ipsec_tunnel) {
      // All the elements returned by xml2js are lists
      // So we always need to get the first element of the list
      const cgw = tunnel.customer_gateway?.[0];
      const vpn = tunnel.vpn_gateway?.[0];

      output[`CgwOutsideIpAddress${index }`] = cgw.tunnel_outside_address?.[0]?.ip_address?.[0];
      output[`CgwInsideIpAddress${index}`] = cgw.tunnel_inside_address?.[0]?.ip_address?.[0];
      output[`CgwInsideNetworkMask${index}`] = cgw.tunnel_inside_address?.[0]?.network_mask?.[0];
      output[`CgwInsideNetworkCidr${index}`] = cgw.tunnel_inside_address?.[0]?.network_cidr?.[0];
      output[`CgwBgpAsn${index}`] = cgw.bgp?.[0]?.asn?.[0];
      output[`VpnOutsideIpAddress${index }`] = vpn.tunnel_outside_address?.[0]?.ip_address?.[0];
      output[`VpnInsideIpAddress${index}`] = vpn.tunnel_inside_address?.[0]?.ip_address?.[0];
      output[`VpnInsideNetworkMask${index}`] = vpn.tunnel_inside_address?.[0]?.network_mask?.[0];
      output[`VpnInsideNetworkCidr${index}`] = vpn.tunnel_inside_address?.[0]?.network_cidr?.[0];
      output[`VpnBgpAsn${index}`] = vpn.bgp?.[0]?.asn?.[0];
      output[`PreSharedKey${index}`] = tunnel.ike?.[0]?.pre_shared_key?.[0];
      index++;
    }

    console.debug('Sending back output');
    console.debug(JSON.stringify(output, null, 2));

    return send(event, context, SUCCESS, output, resourceId);
  } catch (error) {
    console.error(error);

    return send(
      event,
      context,
      FAILED,
      {
        status: 'FAILED',
        statusReason: JSON.stringify(error),
      },
      resourceId,
    );
  }
};
