import * as t from 'io-ts';
import { optional } from '@aws-pbmm/common-types';

export const FirewallInstanceOutputType = t.interface(
  {
    id: t.string,
    name: t.string,
    az: t.string,
  },
  'FirewallInstanceOutput',
);

export type FirewallInstanceOutput = t.TypeOf<typeof FirewallInstanceOutputType>;

export const FirewallPortType = t.interface({
  name: t.string,
  subnetName: t.string,
  az: t.string,
  eipIpAddress: optional(t.string),
  eipAllocationId: optional(t.string),
  createCustomerGateway: t.boolean,
});

export const FirewallPortOutputType = t.array(FirewallPortType, 'FirewallPortOutput');

export type FirewallPort = t.TypeOf<typeof FirewallPortType>;
export type FirewallPortOutput = t.TypeOf<typeof FirewallPortOutputType>;

export const FirewallVpnTunnelOptionsType = t.interface({
  cgwTunnelInsideAddress1: t.string,
  cgwTunnelOutsideAddress1: t.string,
  cgwBgpAsn1: t.string,
  vpnTunnelInsideAddress1: t.string,
  vpnTunnelOutsideAddress1: t.string,
  vpnBgpAsn1: t.string,
  preSharedSecret1: t.string,
});

export const FirewallVpnConnectionType = t.intersection([
  FirewallPortType,
  t.interface({
    firewallAccountKey: t.string,
    transitGatewayId: t.string,
    customerGatewayId: optional(t.string),
    vpnConnectionId: optional(t.string),
    vpnTunnelOptions: optional(FirewallVpnTunnelOptionsType),
  }),
]);

export const FirewallVpnConnectionOutputType = t.array(FirewallVpnConnectionType, 'FirewallVpnConnectionOutput');

export type FirewallVpnTunnelOptions = t.TypeOf<typeof FirewallVpnTunnelOptionsType>;
export type FirewallVpnConnection = t.TypeOf<typeof FirewallVpnConnectionType>;
export type FirewallVpnConnectionOutput = t.TypeOf<typeof FirewallVpnConnectionOutputType>;
