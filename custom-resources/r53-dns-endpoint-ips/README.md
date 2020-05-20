# Retrive Route53 Dns Endpoint IPAddresses 

This is a custom resource to retrive IpAddresses assigned to Route53 Resolver Endpoint using `listResolverEndpointIpAddresses` API call.

## Usage

    import { R53DnsEndPointIps } from '@custom-resources/r53-dns-endpoint-ips';

    const dnsIps = ...;

    const dnsIps = new R53DnsEndPointIps(this, 'InboundIp', {
      resolverEndpointId: this._inboundEndpoint.ref,
      subnetsCount: ipAddresses.length,
    });

    dnsIps.endpointIps // Returns IpAddresses as string[]

