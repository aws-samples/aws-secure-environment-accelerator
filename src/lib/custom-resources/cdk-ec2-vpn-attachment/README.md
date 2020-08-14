# Retrieve VPN Transit Gateway Attachments

This is a custom resource to retrieve Attachment ID assigned to VPN connection using `describeTransitGatewayAttachments` API call.

## Usage

    // Creating VPN connection route table association and propagation
    const attachments = new VpnAttachments(scope, `VpnAttachments${index}`, {
      vpnConnectionId: vpnConnection.ref,
    });

    const associateConfig = tgwAttach['rt-associate'] || [];
    const propagateConfig = tgwAttach['rt-propagate'] || [];

    const tgwRouteAssociates = associateConfig.map(route => transitGateway.getRouteTableIdByName(route)!);
    const tgwRoutePropagates = propagateConfig.map(route => transitGateway.getRouteTableIdByName(route)!);

    for (const [index, route] of tgwRouteAssociates?.entries()) {
      new ec2.CfnTransitGatewayRouteTableAssociation(scope, `tgw_associate_${index}`, {
        transitGatewayAttachmentId: attachments.getTransitGatewayAttachmentId(0), // one vpn connection should only have one attachment
        transitGatewayRouteTableId: route,
      });
    }

    for (const [index, route] of tgwRoutePropagates?.entries()) {
      new ec2.CfnTransitGatewayRouteTablePropagation(scope, `tgw_propagate_${index}`, {
        transitGatewayAttachmentId: attachments.getTransitGatewayAttachmentId(0), // one vpn connection should only have one attachment
        transitGatewayRouteTableId: route,
      });
    }

