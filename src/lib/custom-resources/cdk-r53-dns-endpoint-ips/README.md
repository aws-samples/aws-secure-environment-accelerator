# Retrieve Route53 DNS Endpoint IP Addresses

This is a custom resource to retrieve IpAddresses assigned to Route53 Resolver Endpoint using `listResolverEndpointIpAddresses` API call.

## Usage

    import { R53DnsEndPointIps } from '@aws-accelerator/custom-resource-r53-dns-endpoint-ips';

    const dnsIps = ...;

    const dnsIps = new R53DnsEndPointIps(this, 'InboundIp', {
      resolverEndpointId: this._inboundEndpoint.ref,
      subnetsCount: ipAddresses.length,
    });

    dnsIps.endpointIps // Returns IpAddresses as string[]

