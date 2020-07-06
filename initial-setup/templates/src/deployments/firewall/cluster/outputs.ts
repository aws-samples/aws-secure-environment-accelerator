import * as t from 'io-ts';
import { optional } from '@aws-pbmm/common-types';
import { createCfnStructuredOutput } from '../../../common/structured-output';
import { createStructuredOutputFinder } from '@aws-pbmm/common-outputs/lib/structured-output';

export const FirewallInstanceOutput = t.interface(
  {
    id: t.string,
    name: t.string,
    az: t.string,
  },
  'FirewallInstanceOutput',
);

export type FirewallInstanceOutput = t.TypeOf<typeof FirewallInstanceOutput>;

export const FirewallInstanceOutputFinder = createStructuredOutputFinder(FirewallInstanceOutput, () => ({}));

export const CfnFirewallInstanceOutput = createCfnStructuredOutput(FirewallInstanceOutput);

export const FirewallPort = t.interface({
  name: t.string,
  subnetName: t.string,
  az: t.string,
  eipIpAddress: optional(t.string),
  eipAllocationId: optional(t.string),
  createCustomerGateway: t.boolean,
});

export type FirewallPort = t.TypeOf<typeof FirewallPort>;

export const FirewallPortOutput = t.array(FirewallPort, 'FirewallPortOutput');

export type FirewallPortOutput = t.TypeOf<typeof FirewallPortOutput>;

export const CfnFirewallPortOutput = createCfnStructuredOutput(FirewallPortOutput);

export const FirewallPortOutputFinder = createStructuredOutputFinder(FirewallPortOutput, () => ({}));

export const FirewallVpnTunnelOptions = t.interface({
  cgwTunnelInsideAddress1: t.string,
  cgwTunnelOutsideAddress1: t.string,
  cgwBgpAsn1: t.string,
  vpnTunnelInsideAddress1: t.string,
  vpnTunnelOutsideAddress1: t.string,
  vpnBgpAsn1: t.string,
  preSharedSecret1: t.string,
});

export type FirewallVpnTunnelOptions = t.TypeOf<typeof FirewallVpnTunnelOptions>;

export const FirewallVpnConnection = t.intersection([
  FirewallPort,
  t.interface({
    firewallAccountKey: t.string,
    transitGatewayId: t.string,
    customerGatewayId: optional(t.string),
    vpnConnectionId: optional(t.string),
    vpnTunnelOptions: optional(FirewallVpnTunnelOptions),
  }),
]);

export type FirewallVpnConnection = t.TypeOf<typeof FirewallVpnConnection>;

export const FirewallVpnConnectionOutput = t.array(FirewallVpnConnection, 'FirewallVpnConnectionOutput');

export type FirewallVpnConnectionOutput = t.TypeOf<typeof FirewallVpnConnectionOutput>;

export const CfnFirewallVpnConnectionOutput = createCfnStructuredOutput(FirewallVpnConnectionOutput);

export const FirewallVpnConnectionOutputFinder = createStructuredOutputFinder(FirewallVpnConnectionOutput, () => ({}));
