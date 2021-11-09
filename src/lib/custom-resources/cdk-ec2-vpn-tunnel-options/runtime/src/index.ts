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

import * as AWS from 'aws-sdk';
AWS.config.logger = console;
import * as xml2js from 'xml2js';
import { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/custom-resource-cfn-utils';

const ec2 = new AWS.EC2();

export interface HandlerProperties {
  VPNConnectionID: string;
}

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<unknown> => {
  console.log(`Finding tunnel options...`);
  console.log(JSON.stringify(event, null, 2));

  // eslint-disable-next-line default-case
  switch (event.RequestType) {
    case 'Create':
      return onCreate(event);
    case 'Update':
      return onUpdate(event);
    case 'Delete':
      return onDelete(event);
  }
};

async function onCreate(event: CloudFormationCustomResourceEvent) {
  const properties = (event.ResourceProperties as unknown) as HandlerProperties;

  // Find VPN connection by its ID
  const describeVpnConnections = await throttlingBackOff(() =>
    ec2
      .describeVpnConnections({
        VpnConnectionIds: [properties.VPNConnectionID],
      })
      .promise(),
  );

  const connections = describeVpnConnections.VpnConnections;
  const connection = connections?.[0];
  if (!connection) {
    throw new Error(`Unable to find VPN connection`);
  }

  // The connection.Options.TunnelOptions is empty so we have to parse XML result
  const configuration = await xml2js.parseStringPromise(connection.CustomerGatewayConfiguration!, {
    preserveChildrenOrder: true,
    explicitArray: false,
  });

  // Build the resource output
  let index = 1;
  const data: { [key: string]: string | undefined } = {};
  for (const tunnel of configuration.vpn_connection.ipsec_tunnel) {
    const cgw = tunnel.customer_gateway;
    const vpn = tunnel.vpn_gateway;

    data[`CgwOutsideIpAddress${index}`] = cgw.tunnel_outside_address?.ip_address;
    data[`CgwInsideIpAddress${index}`] = cgw.tunnel_inside_address?.ip_address;
    data[`CgwInsideNetworkMask${index}`] = cgw.tunnel_inside_address?.network_mask;
    data[`CgwInsideNetworkCidr${index}`] = cgw.tunnel_inside_address?.network_cidr;
    data[`CgwBgpAsn${index}`] = cgw.bgp?.asn;
    data[`VpnOutsideIpAddress${index}`] = vpn.tunnel_outside_address?.ip_address;
    data[`VpnInsideIpAddress${index}`] = vpn.tunnel_inside_address?.ip_address;
    data[`VpnInsideNetworkMask${index}`] = vpn.tunnel_inside_address?.network_mask;
    data[`VpnInsideNetworkCidr${index}`] = vpn.tunnel_inside_address?.network_cidr;
    data[`VpnBgpAsn${index}`] = vpn.bgp?.asn;
    data[`PreSharedKey${index}`] = tunnel.ike?.pre_shared_key;
    index++;
  }

  return {
    Data: data,
  };
}

async function onUpdate(event: CloudFormationCustomResourceEvent) {
  return onCreate(event);
}

async function onDelete(_: CloudFormationCustomResourceEvent) {
  console.log(`Nothing to do for delete...`);
}
