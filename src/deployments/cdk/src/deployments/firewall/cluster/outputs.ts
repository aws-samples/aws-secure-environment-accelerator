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

import * as t from 'io-ts';
import { optional } from '@aws-accelerator/common-types';
import { createCfnStructuredOutput } from '../../../common/structured-output';
import { createStructuredOutputFinder } from '@aws-accelerator/common-outputs/src/structured-output';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { FirewallConfigReplacementsOutput } from '@aws-accelerator/common-outputs/src/firewall';

export const FirewallInstanceOutput = t.interface(
  {
    id: t.string,
    name: t.string,
    az: t.string,
  },
  'FirewallInstanceOutput',
);

export const CfnFirewallConfigReplacementsOutput = createCfnStructuredOutput(FirewallConfigReplacementsOutput);

export type FirewallInstanceOutput = t.TypeOf<typeof FirewallInstanceOutput>;

export const FirewallInstanceOutputFinder = createStructuredOutputFinder(FirewallInstanceOutput, () => ({}));

export const CfnFirewallInstanceOutput = createCfnStructuredOutput(FirewallInstanceOutput);

export const FirewallPort = t.interface({
  firewallName: t.string,
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
  cgwBgpAsn1: optional(t.string),
  vpnTunnelInsideAddress1: t.string,
  vpnTunnelOutsideAddress1: t.string,
  vpnBgpAsn1: optional(t.string),
  preSharedSecret1: t.string,
  cgwTunnelInsideAddress2: t.string,
  cgwTunnelOutsideAddress2: t.string,
  cgwBgpAsn2: optional(t.string),
  vpnTunnelInsideAddress2: t.string,
  vpnTunnelOutsideAddress2: t.string,
  vpnBgpAsn2: optional(t.string),
  preSharedSecret2: t.string,
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

export const TgwVpnAttachment = t.interface({
  subnet: optional(t.string),
  az: optional(t.string),
  index: optional(t.string),
  id: t.string,
});

export type TgwVpnAttachment = t.TypeOf<typeof TgwVpnAttachment>;

export const TgwVpnAttachmentsOutput = t.interface(
  {
    name: t.string,
    attachments: t.array(TgwVpnAttachment),
  },
  'TgwVpnAttachmentsOutput',
);

export type TgwVpnAttachmentsOutput = t.TypeOf<typeof TgwVpnAttachmentsOutput>;

export const CfnTgwVpnAttachmentsOutput = createCfnStructuredOutput(TgwVpnAttachmentsOutput);

export const TgwVpnAttachmentsOutputFinder = createStructuredOutputFinder(TgwVpnAttachmentsOutput, finder => ({
  tryFindOneByName: (props: { outputs: StackOutput[]; accountKey?: string; name: string; region?: string }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      accountKey: props.accountKey,
      region: props.region,
      predicate: o => o.name === props.name,
    }),
}));
