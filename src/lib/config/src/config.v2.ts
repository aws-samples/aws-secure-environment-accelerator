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

import * as t from '@aws-accelerator/common-types';

export const MandatoryAccountType = t.enums('MandatoryAccountType', [
  'master',
  'central-security',
  'central-log',
  'central-operations',
]);

export type MandatoryAccountType = t.TypeOf<typeof MandatoryAccountType>;

export const ConfigRuleType = t.enums('ConfigRuleType', ['managed', 'custom']);

export type ConfigRuleType = t.TypeOf<typeof ConfigRuleType>;

export const LBType = t.enums('LBType', ['ALB', 'GWLB']);

export type LBType = t.TypeOf<typeof LBType>;
export const SecurityHubFindingsSnsType = t.enums('SecurityHubFindingsSnsType', [
  'None',
  'Low',
  'Medium',
  'High',
  'Critical',
]);
export type SecurityHubFindingsSnsType = t.TypeOf<typeof SecurityHubFindingsSnsType>;

export const FirewallManagerAlertLevelType = t.enums('FirewallManagerAlertLevelType', [
  'None',
  'Low',
  'Medium',
  'High',
]);
export type FirewallManagerAlertLevelType = t.TypeOf<typeof FirewallManagerAlertLevelType>;

export const asn = t.sized<number>(t.number, {
  min: 0,
  max: 65535,
});

export const VirtualPrivateGatewayConfig = t.interface({
  asn: t.optional(asn),
});

export const PeeringConnectionConfig = t.interface({
  source: t.nonEmptyString,
  'source-vpc': t.nonEmptyString,
  'source-subnets': t.nonEmptyString,
  'local-subnets': t.nonEmptyString,
});

export const NatGatewayConfig = t.interface({
  subnet: t.interface({
    name: t.nonEmptyString,
    az: t.optional(t.availabilityZone),
  }),
});

export const NfwLogType = t.enums('NfwLogType', ['None', 'S3', 'CloudWatch']);

export const AWSNetworkFirewallConfig = t.interface({
  'firewall-name': t.optional(t.nonEmptyString),
  subnet: t.interface({
    name: t.nonEmptyString,
    az: t.optional(t.availabilityZone),
  }),
  policy: t.optional(
    t.interface({
      name: t.nonEmptyString,
      path: t.nonEmptyString,
    }),
  ),
  policyString: t.optional(t.nonEmptyString),
  'alert-dest': t.defaulted(NfwLogType, 'None'),
  'flow-dest': t.defaulted(NfwLogType, 'None'),
});

export const AlbIpForwardingConfig = t.optional(t.boolean);

export const CidrConfigType = t.interface({
  value: t.optional(t.cidr),
  size: t.optional(t.number),
  pool: t.defaulted(t.nonEmptyString, 'main'),
});

export type CidrConfig = t.TypeOf<typeof CidrConfigType>;

export const SubnetDefinitionConfig = t.interface({
  az: t.union([t.availabilityZone, t.nonEmptyString]),
  'outpost-arn': t.optional(t.nonEmptyString),
  cidr: t.optional(CidrConfigType),
  'route-table': t.nonEmptyString,
  disabled: t.defaulted(t.boolean, false),
});

export const SubnetSourceConfig = t.interface({
  account: t.optional(t.nonEmptyString),
  vpc: t.nonEmptyString,
  subnet: t.array(t.nonEmptyString),
});

export const NaclConfigType = t.interface({
  rule: t.number,
  protocol: t.number,
  ports: t.number,
  'rule-action': t.nonEmptyString,
  egress: t.boolean,
  'cidr-blocks': t.union([t.array(t.nonEmptyString), t.array(SubnetSourceConfig)]),
});

export type NaclConfig = t.TypeOf<typeof NaclConfigType>;

export const SubnetConfigType = t.interface({
  name: t.nonEmptyString,
  'share-to-ou-accounts': t.defaulted(t.boolean, false),
  'share-to-specific-accounts': t.optional(t.array(t.nonEmptyString)),
  definitions: t.array(SubnetDefinitionConfig),
  nacls: t.optional(t.array(NaclConfigType)),
});

export type SubnetConfig = t.TypeOf<typeof SubnetConfigType>;

export const GatewayEndpointType = t.enums('GatewayEndpointType', ['s3', 'dynamodb']);

export type GatewayEndpointType = t.TypeOf<typeof GatewayEndpointType>;

export const PcxRouteConfigType = t.interface({
  account: t.nonEmptyString,
  vpc: t.nonEmptyString,
  subnet: t.nonEmptyString,
});

export type PcxRouteConfig = t.TypeOf<typeof PcxRouteConfigType>;

export const AccountVpcConfigType = t.interface({
  account: t.defaulted(t.nonEmptyString, 'local'),
  vpc: t.nonEmptyString,
  subnet: t.nonEmptyString,
});

export type AccountVpcConfigType = t.TypeOf<typeof AccountVpcConfigType>;

export const RouteTargetType = t.enums('RouteTargetType', [
  'egressOnlyInternetGatewayId',
  'gatewayId',
  'instanceId',
  'localGatewayId',
  'natGatewayId',
  'networkInterfaceId',
  'transitGatewayId',
  'vpcEndpointId',
  'vpcPeeringConnectionId',
]);

export type RouteTargetType = t.TypeOf<typeof RouteTargetType>;

export const RouteConfig = t.interface({
  destination: t.union([t.nonEmptyString, PcxRouteConfigType]), // TODO Can be string or destination in another account
  target: t.nonEmptyString,
  name: t.optional(t.nonEmptyString),
  az: t.optional(t.nonEmptyString),
  port: t.optional(t.nonEmptyString),
  type: t.optional(RouteTargetType),
  'target-id': t.optional(t.nonEmptyString),
});

export const RouteTableConfigType = t.interface({
  name: t.nonEmptyString,
  routes: t.optional(t.array(RouteConfig)),
});

export type RouteTableConfig = t.TypeOf<typeof RouteTableConfigType>;

export const TransitGatewayAttachOption = t.nonEmptyString; // TODO Define all attach options here

export const TransitGatewayAssociationType = t.enums('TransitGatewayAssociationType', ['ATTACH', 'VPN']);

export type TransitGatewayAssociationType = t.TypeOf<typeof TransitGatewayAssociationType>;

export const TransitGatewayAttachConfigType = t.interface({
  'associate-to-tgw': t.nonEmptyString,
  account: t.nonEmptyString,
  'associate-type': t.optional(TransitGatewayAssociationType),
  'tgw-rt-associate': t.array(t.nonEmptyString),
  'tgw-rt-propagate': t.array(t.nonEmptyString),
  'blackhole-route': t.optional(t.boolean),
  'attach-subnets': t.optional(t.array(t.nonEmptyString)),
  options: t.optional(t.array(TransitGatewayAttachOption)),
});

export type TransitGatewayAttachConfig = t.TypeOf<typeof TransitGatewayAttachConfigType>;

export const TransitGatewayRouteConfigType = t.interface({
  destination: t.nonEmptyString,
  'target-tgw': t.optional(t.nonEmptyString),
  'target-vpc': t.optional(t.nonEmptyString),
  'target-account': t.optional(t.nonEmptyString),
  'target-vpn': t.optional(
    t.interface({
      name: t.nonEmptyString,
      az: t.nonEmptyString,
      subnet: t.nonEmptyString,
    }),
  ),
  'blackhole-route': t.optional(t.boolean),
});

export type TransitGatewayRouteConfig = t.TypeOf<typeof TransitGatewayRouteConfigType>;

export const TransitGatewayRouteTablesConfigType = t.interface({
  name: t.nonEmptyString,
  routes: t.optional(t.array(TransitGatewayRouteConfigType)),
});

export type TransitGatewayRouteTablesConfig = t.TypeOf<typeof TransitGatewayRouteTablesConfigType>;

export const TransitGatewayAttachDeploymentConfigType = t.interface({
  'associate-to-tgw': t.nonEmptyString,
  account: t.nonEmptyString,
  region: t.nonEmptyString,
  'tgw-rt-associate-local': t.array(t.nonEmptyString),
  'tgw-rt-associate-remote': t.array(t.nonEmptyString),
});

export type TransitGatewayAttachDeploymentConfig = t.TypeOf<typeof TransitGatewayAttachDeploymentConfigType>;

export const InterfaceEndpointName = t.nonEmptyString; // TODO Define all endpoints here

export const InterfaceEndpointConfig = t.interface({
  subnet: t.nonEmptyString,
  endpoints: t.array(InterfaceEndpointName),
  'allowed-cidrs': t.optional(t.array(t.cidr)),
});

export const ResolversConfigType = t.interface({
  subnet: t.nonEmptyString,
  outbound: t.boolean,
  inbound: t.boolean,
});

export type ResolversConfig = t.TypeOf<typeof ResolversConfigType>;

export const OnPremZoneConfigType = t.interface({
  zone: t.nonEmptyString,
  'outbound-ips': t.array(t.nonEmptyString),
});

export const SecurityGroupSourceConfig = t.interface({
  'security-group': t.array(t.nonEmptyString),
});

export const SecurityGroupRuleConfigType = t.interface({
  type: t.optional(t.array(t.nonEmptyString)),
  'tcp-ports': t.optional(t.array(t.number)),
  'udp-ports': t.optional(t.array(t.number)),
  port: t.optional(t.number),
  description: t.nonEmptyString,
  toPort: t.optional(t.number),
  fromPort: t.optional(t.number),
  source: t.array(t.union([t.nonEmptyString, SubnetSourceConfig, SecurityGroupSourceConfig])),
});

export type SecurityGroupRuleConfig = t.TypeOf<typeof SecurityGroupRuleConfigType>;

export const SecurityGroupConfigType = t.interface({
  name: t.nonEmptyString,
  'inbound-rules': t.array(SecurityGroupRuleConfigType),
  'outbound-rules': t.array(SecurityGroupRuleConfigType),
});

export type SecurityGroupConfig = t.TypeOf<typeof SecurityGroupConfigType>;

export const ZoneNamesConfigType = t.interface({
  public: t.defaulted(t.array(t.nonEmptyString), []),
  private: t.defaulted(t.array(t.nonEmptyString), []),
});

export const FlowLogsDestinationTypes = t.enums('FlowLogsDestinationTypes', ['S3', 'CWL', 'BOTH', 'NONE']);

export type FlowLogsDestinationTypes = t.TypeOf<typeof FlowLogsDestinationTypes>;

export const CidrSrcTypes = t.enums('CidrSrcTypes', ['provided', 'lookup', 'dynamic']);

export type CidrSrcTypes = t.TypeOf<typeof CidrSrcTypes>;

export const VpcConfigType = t.interface({
  deploy: t.nonEmptyString,
  name: t.nonEmptyString,
  description: t.optional(t.nonEmptyString),
  region: t.region,
  cidr: t.defaulted(t.array(CidrConfigType), []),
  'cidr-src': t.defaulted(CidrSrcTypes, 'provided'),
  'opt-in': t.defaulted(t.boolean, false),
  'dedicated-tenancy': t.defaulted(t.boolean, false),
  'use-central-endpoints': t.defaulted(t.boolean, false),
  'dns-resolver-logging': t.defaulted(t.boolean, false),
  'flow-logs': t.defaulted(FlowLogsDestinationTypes, 'NONE'),
  'log-retention': t.optional(t.number),
  igw: t.defaulted(t.boolean, false),
  vgw: t.optional(VirtualPrivateGatewayConfig),
  pcx: t.optional(PeeringConnectionConfig),
  natgw: t.optional(NatGatewayConfig),
  nfw: t.optional(AWSNetworkFirewallConfig),
  'alb-forwarding': t.optional(AlbIpForwardingConfig),
  subnets: t.optional(t.array(SubnetConfigType)),
  'gateway-endpoints': t.optional(t.array(GatewayEndpointType)),
  'route-tables': t.optional(t.array(RouteTableConfigType)),
  'tgw-attach': t.optional(TransitGatewayAttachConfigType),
  'interface-endpoints': t.optional(InterfaceEndpointConfig),
  resolvers: t.optional(ResolversConfigType),
  'on-premise-rules': t.optional(t.array(OnPremZoneConfigType)),
  'security-groups': t.optional(t.array(SecurityGroupConfigType)),
  zones: t.optional(ZoneNamesConfigType),
  'central-endpoint': t.defaulted(t.boolean, false),
  'lgw-route-table-id': t.optional(t.nonEmptyString),
});

export type VpcConfig = t.TypeOf<typeof VpcConfigType>;

export const IamUserConfigType = t.interface({
  'user-ids': t.array(t.nonEmptyString),
  group: t.nonEmptyString,
  policies: t.array(t.nonEmptyString),
  'boundary-policy': t.nonEmptyString,
});

export const IamPolicyConfigType = t.interface({
  'policy-name': t.nonEmptyString,
  policy: t.nonEmptyString,
});

// ssm-log-archive-access will be deprecated in a future release.
// ssm-log-archive-write-access should be used instead
export const IamRoleConfigType = t.interface({
  role: t.nonEmptyString,
  type: t.nonEmptyString,
  policies: t.array(t.nonEmptyString),
  'boundary-policy': t.nonEmptyString,
  'source-account': t.optional(t.nonEmptyString),
  'source-account-role': t.optional(t.nonEmptyString),
  'trust-policy': t.optional(t.nonEmptyString),
  'ssm-log-archive-access': t.optional(t.boolean),
  'ssm-log-archive-write-access': t.optional(t.boolean),
  'ssm-log-archive-read-only-access': t.optional(t.boolean),
  'meta-data-read-only-access': t.optional(t.boolean),
});

export const IamConfigType = t.interface({
  users: t.optional(t.array(IamUserConfigType)),
  policies: t.optional(t.array(IamPolicyConfigType)),
  roles: t.optional(t.array(IamRoleConfigType)),
});

export type IamConfig = t.TypeOf<typeof IamConfigType>;

export const ImportCertificateConfigType = t.interface({
  name: t.nonEmptyString,
  type: t.literal('import'),
  'priv-key': t.nonEmptyString,
  cert: t.nonEmptyString,
  chain: t.optional(t.nonEmptyString),
});

export type ImportCertificateConfig = t.TypeOf<typeof ImportCertificateConfigType>;

export const CertificateValidationType = t.enums('CertificateValidation', ['DNS', 'EMAIL']);

export type CertificateValidationType = t.TypeOf<typeof CertificateValidationType>;

export type CertificateValidation = t.TypeOf<typeof CertificateValidationType>;

export const RequestCertificateConfigType = t.interface({
  name: t.nonEmptyString,
  type: t.literal('request'),
  domain: t.nonEmptyString,
  validation: CertificateValidationType,
  san: t.optional(t.array(t.nonEmptyString)),
});

export type RequestCertificateConfig = t.TypeOf<typeof RequestCertificateConfigType>;

export const CertificateConfigType = t.union([ImportCertificateConfigType, RequestCertificateConfigType]);

export type CertificateConfig = t.TypeOf<typeof CertificateConfigType>;

export const TgwDeploymentConfigType = t.interface({
  name: t.nonEmptyString,
  region: t.nonEmptyString,
  asn: t.optional(t.number),
  features: t.optional(
    t.interface({
      'DNS-support': t.boolean,
      'VPN-ECMP-support': t.boolean,
      'Default-route-table-association': t.boolean,
      'Default-route-table-propagation': t.boolean,
      'Auto-accept-sharing-attachments': t.boolean,
    }),
  ),
  'route-tables': t.optional(t.array(t.nonEmptyString)),
  'tgw-attach': t.optional(TransitGatewayAttachDeploymentConfigType),
  'tgw-routes': t.optional(t.array(TransitGatewayRouteTablesConfigType)),
});

export const PasswordPolicyType = t.interface({
  history: t.number,
  'max-age': t.number,
  'min-age': t.number,
  'min-len': t.number,
  complexity: t.boolean,
  reversible: t.boolean,
  'failed-attempts': t.number,
  'lockout-duration': t.number,
  'lockout-attempts-reset': t.number,
});

export type TgwDeploymentConfig = t.TypeOf<typeof TgwDeploymentConfigType>;

export const ADUserConfig = t.interface({
  user: t.nonEmptyString,
  email: t.nonEmptyString,
  groups: t.array(t.nonEmptyString),
});

export type ADUserConfig = t.TypeOf<typeof ADUserConfig>;

export const MadConfigType = t.interface({
  description: t.optional(t.nonEmptyString),
  'dir-id': t.number,
  deploy: t.boolean,
  'vpc-name': t.nonEmptyString,
  region: t.nonEmptyString,
  subnet: t.nonEmptyString,
  azs: t.defaulted(t.array(t.nonEmptyString), []),
  size: t.nonEmptyString,
  'image-path': t.nonEmptyString,
  'dns-domain': t.nonEmptyString,
  'netbios-domain': t.nonEmptyString,
  'central-resolver-rule-account': t.nonEmptyString,
  'central-resolver-rule-vpc': t.nonEmptyString,
  'log-group-name': t.nonEmptyString,
  'share-to-account': t.optional(t.nonEmptyString),
  restrict_srcips: t.array(t.cidr),
  'rdgw-instance-type': t.nonEmptyString,
  'rdgw-instance-role': t.nonEmptyString,
  'rdgw-enforce-imdsv2': t.defaulted(t.boolean, false),
  'num-rdgw-hosts': t.number,
  'rdgw-max-instance-age': t.number,
  'min-rdgw-hosts': t.number,
  'max-rdgw-hosts': t.number,
  'password-policies': PasswordPolicyType,
  'ad-groups': t.array(t.nonEmptyString),
  'ad-per-account-groups': t.array(t.nonEmptyString),
  'adc-group': t.nonEmptyString,
  'ad-users': t.array(ADUserConfig),
  'security-groups': t.array(SecurityGroupConfigType),
  'password-secret-name': t.optional(t.nonEmptyString),
});

export type MadDeploymentConfig = t.TypeOf<typeof MadConfigType>;

export const RsyslogSubnetConfig = t.interface({
  name: t.nonEmptyString,
  az: t.nonEmptyString,
});

export const RsyslogConfig = t.interface({
  deploy: t.boolean,
  'vpc-name': t.nonEmptyString,
  region: t.nonEmptyString,
  'log-group-name': t.nonEmptyString,
  'security-groups': t.array(SecurityGroupConfigType),
  'app-subnets': t.array(RsyslogSubnetConfig),
  'web-subnets': t.array(RsyslogSubnetConfig),
  'min-rsyslog-hosts': t.number,
  'desired-rsyslog-hosts': t.number,
  'max-rsyslog-hosts': t.number,
  'ssm-image-id': t.nonEmptyString,
  'rsyslog-instance-type': t.nonEmptyString,
  'rsyslog-instance-role': t.nonEmptyString,
  'rsyslog-enforce-imdsv2': t.defaulted(t.boolean, false),
  'rsyslog-root-volume-size': t.number,
  'rsyslog-max-instance-age': t.number,
  'user-data': t.optional(t.nonEmptyString),
});

export type RsyslogConfig = t.TypeOf<typeof RsyslogConfig>;

export const ElbTargetInstanceFirewallConfigType = t.interface({
  target: t.literal('firewall'),
  name: t.nonEmptyString,
  az: t.nonEmptyString,
});

export type ElbTargetInstanceFirewallConfig = t.TypeOf<typeof ElbTargetInstanceFirewallConfigType>;

// Could be a t.union in the future if we allow multiple config types
export const ElbTargetInstanceConfigType = ElbTargetInstanceFirewallConfigType;

export type ElbTargetInstanceConfig = t.TypeOf<typeof ElbTargetInstanceConfigType>;

export const ElbTargetConfigType = t.interface({
  'target-name': t.nonEmptyString,
  'target-type': t.nonEmptyString,
  protocol: t.optional(t.nonEmptyString),
  port: t.optional(t.number),
  'health-check-protocol': t.optional(t.nonEmptyString),
  'health-check-path': t.optional(t.nonEmptyString),
  'health-check-port': t.optional(t.number),
  'lambda-filename': t.optional(t.nonEmptyString),
  'target-instances': t.optional(t.array(ElbTargetInstanceConfigType)),
  'tg-weight': t.optional(t.number),
});

export type ElbTargetConfig = t.TypeOf<typeof ElbTargetConfigType>;

export const AlbConfigType = t.interface({
  type: t.defaulted(t.literal('ALB'), 'ALB'),
  name: t.string,
  scheme: t.string,
  'action-type': t.string,
  'ip-type': t.string,
  listeners: t.string,
  ports: t.number,
  vpc: t.string,
  subnets: t.string,
  'cert-name': t.string,
  'cert-arn': t.optional(t.string),
  'security-policy': t.string,
  'security-group': t.string,
  'tg-stickiness': t.optional(t.string),
  'target-alarms-notify': t.optional(t.string),
  'target-alarms-when': t.optional(t.string),
  'target-alarms-of': t.optional(t.string),
  'target-alarms-is': t.optional(t.string),
  'target-alarms-Count': t.optional(t.string),
  'target-alarms-for': t.optional(t.string),
  'target-alarms-periods-of': t.optional(t.string),
  'access-logs': t.defaulted(t.boolean, false),
  targets: t.array(ElbTargetConfigType),
  'apply-tags': t.optional(t.record(t.string, t.string)),
});

export type AlbConfigType = t.TypeOf<typeof AlbConfigType>;

export const GwlbConfigType = t.interface({
  type: t.literal('GWLB'),
  name: t.nonEmptyString,
  'action-type': t.nonEmptyString,
  'ip-type': t.nonEmptyString,
  vpc: t.nonEmptyString,
  subnets: t.nonEmptyString,
  targets: t.array(ElbTargetConfigType),
  'cross-zone': t.defaulted(t.boolean, false),
  'endpoint-subnets': t.array(AccountVpcConfigType),
  'apply-tags': t.optional(t.record(t.string, t.string)),
});

export type GwlbConfigType = t.TypeOf<typeof GwlbConfigType>;

export const AccountConfigType = t.interface({
  // 'password-policies': PasswordPolicyType,
  'ad-groups': t.array(t.nonEmptyString),
  'adc-group': t.nonEmptyString,
  'ad-users': t.array(ADUserConfig),
});

export const AdcConfigType = t.interface({
  deploy: t.boolean,
  'vpc-name': t.nonEmptyString,
  subnet: t.nonEmptyString,
  azs: t.defaulted(t.array(t.nonEmptyString), []),
  size: t.nonEmptyString,
  restrict_srcips: t.array(t.cidr),
  'connect-account-key': t.nonEmptyString,
  'connect-dir-id': t.number,
});

export const FirewallPortConfigPrivateIpType = t.interface({
  az: t.string,
  ip: t.string,
});

export const FirewallPortConfigType = t.interface({
  name: t.nonEmptyString,
  subnet: t.nonEmptyString,
  'create-eip': t.boolean,
  'create-cgw': t.boolean,
  'private-ips': t.optional(t.array(FirewallPortConfigPrivateIpType)),
});

export const FirewallEC2ConfigType = t.interface({
  type: t.defaulted(t.literal('EC2'), 'EC2'),
  deploy: t.defaulted(t.boolean, true),
  name: t.nonEmptyString,
  'instance-sizes': t.nonEmptyString,
  'image-id': t.nonEmptyString,
  'enforce-imdsv2': t.defaulted(t.boolean, false),
  region: t.nonEmptyString,
  vpc: t.nonEmptyString,
  'security-group': t.nonEmptyString,
  ports: t.array(FirewallPortConfigType),
  license: t.optional(t.array(t.nonEmptyString)),
  config: t.optional(t.nonEmptyString),
  'fw-instance-role': t.nonEmptyString,
  'fw-cgw-name': t.nonEmptyString,
  'fw-cgw-asn': t.number,
  'fw-cgw-routing': t.nonEmptyString,
  'tgw-attach': t.union([TransitGatewayAttachConfigType, t.boolean, t.undefined]),
  'block-device-mappings': t.array(t.string),
  'user-data': t.optional(t.nonEmptyString),
  bootstrap: t.optional(t.nonEmptyString),
  'apply-tags': t.optional(t.record(t.string, t.string)),
});

export type FirewallEC2ConfigType = t.TypeOf<typeof FirewallEC2ConfigType>;

export const FirewallCGWConfigType = t.interface({
  type: t.literal('CGW'),
  deploy: t.defaulted(t.boolean, false),
  name: t.nonEmptyString,
  region: t.nonEmptyString,
  'fw-ips': t.array(t.nonEmptyString),
  'fw-cgw-name': t.nonEmptyString,
  'fw-cgw-asn': t.number,
  'fw-cgw-routing': t.nonEmptyString,
  'tgw-attach': t.union([TransitGatewayAttachConfigType, t.boolean, t.undefined]),
  'apply-tags': t.optional(t.record(t.string, t.string)),
});

export type FirewallCGWConfigType = t.TypeOf<typeof FirewallCGWConfigType>;

export const FirewallAutoScaleConfigType = t.interface({
  type: t.literal('autoscale'),
  deploy: t.defaulted(t.boolean, false),
  name: t.nonEmptyString,
  'instance-sizes': t.nonEmptyString,
  'image-id': t.nonEmptyString,
  region: t.nonEmptyString,
  vpc: t.nonEmptyString,
  subnet: t.nonEmptyString,
  'security-group': t.nonEmptyString,
  'enforce-imdsv2': t.defaulted(t.boolean, false),
  'fw-instance-role': t.optional(t.string),
  'user-data': t.optional(t.string),
  bootstrap: t.optional(t.nonEmptyString),
  'root-volume-size': t.number,
  'min-hosts': t.number,
  'max-hosts': t.number,
  'desired-hosts': t.number,
  'max-instance-age': t.number,
  'load-balancer': t.nonEmptyString,
  'key-pair': t.optional(t.nonEmptyString),
  'block-device-mappings': t.array(t.string),
  'create-eip': t.defaulted(t.boolean, false),
  'cpu-utilization-scale-in': t.optional(t.number),
  'cpu-utilization-scale-out': t.optional(t.number),
  'apply-tags': t.optional(t.record(t.string, t.string)),
});

export type FirewallAutoScaleConfigType = t.TypeOf<typeof FirewallAutoScaleConfigType>;

export const FirewallManagerConfigType = t.interface({
  name: t.nonEmptyString,
  'instance-sizes': t.nonEmptyString,
  'image-id': t.nonEmptyString,
  'enforce-imdsv2': t.defaulted(t.boolean, false),
  region: t.nonEmptyString,
  vpc: t.nonEmptyString,
  'security-group': t.nonEmptyString,
  subnet: t.interface({
    name: t.nonEmptyString,
    az: t.nonEmptyString,
  }),
  'create-eip': t.boolean,
  'user-data': t.optional(t.string),
  bootstrap: t.optional(t.nonEmptyString),
  'key-pair': t.optional(t.nonEmptyString),
  /**
   * Possible values are
   * Fortinet: ["/dev/sda1", "/dev/sdb"]
   * Checkpoint: ["/dev/xvda"]
   */
  'block-device-mappings': t.array(t.string),
  'apply-tags': t.optional(t.record(t.string, t.string)),
  'fw-instance-role': t.optional(t.string),
});

export type FirewallManagerConfig = t.TypeOf<typeof FirewallManagerConfigType>;

export const LandingZoneAccountType = t.enums('LandingZoneAccountConfigType', [
  'primary',
  'security',
  'log-archive',
  'shared-services',
]);
export type LandingZoneAccountType = t.TypeOf<typeof LandingZoneAccountType>;

export const BaseLineConfigType = t.enums('BaseLineConfigType', ['LANDING_ZONE', 'ORGANIZATIONS', 'CONTROL_TOWER']);
export type BaseLineType = t.TypeOf<typeof BaseLineConfigType>;

export const DeploymentConfigType = t.interface({
  tgw: t.optional(t.array(TgwDeploymentConfigType)),
  mad: t.optional(MadConfigType),
  rsyslog: t.optional(RsyslogConfig),
  adc: t.optional(AdcConfigType),
  firewalls: t.optional(t.array(t.union([FirewallEC2ConfigType, FirewallCGWConfigType, FirewallAutoScaleConfigType]))),
  'firewall-manager': t.optional(FirewallManagerConfigType),
});

export type DeploymentConfig = t.TypeOf<typeof DeploymentConfigType>;

export const BudgetNotificationType = t.interface({
  type: t.nonEmptyString,
  'threshold-percent': t.number,
  emails: t.array(t.nonEmptyString),
});

export type BudgetConfig = t.TypeOf<typeof BudgetConfigType>;

export const BudgetConfigType = t.interface({
  name: t.nonEmptyString,
  period: t.nonEmptyString,
  amount: t.number,
  include: t.array(t.nonEmptyString),
  alerts: t.array(BudgetNotificationType),
});

export const LimitConfig = t.interface({
  value: t.number,
  'customer-confirm-inplace': t.defaulted(t.boolean, false),
});

export const SsmShareAutomation = t.interface({
  account: t.nonEmptyString,
  regions: t.array(t.nonEmptyString),
  documents: t.array(t.nonEmptyString),
});

export type SsmShareAutomation = t.TypeOf<typeof SsmShareAutomation>;

export const AwsConfigRules = t.interface({
  'excl-regions': t.array(t.nonEmptyString),
  rules: t.array(t.nonEmptyString),
  'remediate-regions': t.optional(t.array(t.nonEmptyString)),
});

export const AwsConfigAccountConfig = t.interface({
  regions: t.array(t.nonEmptyString),
  'excl-rules': t.array(t.nonEmptyString),
});

export const KeyPairConfig = t.interface({
  name: t.nonEmptyString,
  region: t.nonEmptyString,
});

export const SecretConfig = t.interface({
  name: t.nonEmptyString,
  region: t.string,
  size: t.number,
});

export const S3LogPartitionType = t.interface({
  logGroupPattern: t.nonEmptyString,
  s3Prefix: t.nonEmptyString,
});

export type S3LogPartition = t.TypeOf<typeof S3LogPartitionType>;

export const MandatoryAccountConfigType = t.interface({
  'gui-perm': t.optional(t.boolean),
  'account-name': t.nonEmptyString,
  description: t.optional(t.nonEmptyString),
  email: t.nonEmptyString,
  ou: t.nonEmptyString,
  'ou-path': t.optional(t.nonEmptyString),
  'share-mad-from': t.optional(t.nonEmptyString),
  'enable-s3-public-access': t.defaulted(t.boolean, false),
  iam: t.optional(IamConfigType),
  limits: t.defaulted(t.record(t.nonEmptyString, LimitConfig), {}),
  certificates: t.optional(t.array(CertificateConfigType)),
  vpc: t.optional(t.array(VpcConfigType)),
  deployments: t.optional(DeploymentConfigType),
  alb: t.optional(t.array(t.union([AlbConfigType, GwlbConfigType]))),
  's3-retention': t.optional(t.number),
  budget: t.optional(BudgetConfigType),
  'account-warming-required': t.optional(t.boolean),
  'cwl-retention': t.optional(t.number),
  deleted: t.defaulted(t.boolean, false),
  'src-filename': t.nonEmptyString,
  'exclude-ou-albs': t.optional(t.boolean),
  'keep-default-vpc-regions': t.defaulted(t.array(t.nonEmptyString), []),
  'populate-all-elbs-in-param-store': t.defaulted(t.boolean, false),
  'ssm-automation': t.defaulted(t.array(SsmShareAutomation), []),
  'ssm-inventory-collection': t.optional(t.boolean),
  'aws-config': t.defaulted(t.array(AwsConfigAccountConfig), []),
  scps: t.optional(t.array(t.nonEmptyString)),
  'opt-in-vpcs': t.optional(t.array(t.nonEmptyString)),
  'key-pairs': t.defaulted(t.array(KeyPairConfig), []),
  secrets: t.defaulted(t.array(SecretConfig), []),
});

export type MandatoryAccountConfig = t.TypeOf<typeof MandatoryAccountConfigType>;

export type AccountConfig = t.TypeOf<typeof MandatoryAccountConfigType>;

export const AccountsConfigType = t.record(t.nonEmptyString, MandatoryAccountConfigType);

export type AccountsConfig = t.TypeOf<typeof AccountsConfigType>;

export const OrganizationalUnitConfigType = t.interface({
  'gui-perm': t.optional(t.boolean),
  description: t.optional(t.nonEmptyString),
  type: t.nonEmptyString,
  scps: t.array(t.nonEmptyString),
  'share-mad-from': t.optional(t.nonEmptyString),
  certificates: t.optional(t.array(CertificateConfigType)),
  iam: t.optional(IamConfigType),
  alb: t.optional(t.array(t.union([AlbConfigType, GwlbConfigType]))),
  vpc: t.optional(t.array(VpcConfigType)),
  'default-budgets': t.optional(BudgetConfigType),
  'ssm-automation': t.defaulted(t.array(SsmShareAutomation), []),
  'aws-config': t.defaulted(t.array(AwsConfigRules), []),
  'ssm-inventory-collection': t.optional(t.boolean),
});

export type OrganizationalUnitConfig = t.TypeOf<typeof OrganizationalUnitConfigType>;

export type OrganizationalUnit = t.TypeOf<typeof OrganizationalUnitConfigType>;

export const OrganizationalUnitsConfigType = t.record(t.nonEmptyString, OrganizationalUnitConfigType);

export type OrganizationalUnitsConfig = t.TypeOf<typeof OrganizationalUnitsConfigType>;

export const GlobalOptionsZonesConfigType = t.interface({
  account: t.nonEmptyString,
  'resolver-vpc': t.nonEmptyString,
  names: t.optional(ZoneNamesConfigType),
  region: t.nonEmptyString,
});

export const CostAndUsageReportConfigType = t.interface({
  'additional-schema-elements': t.array(t.nonEmptyString),
  compression: t.nonEmptyString,
  format: t.nonEmptyString,
  'report-name': t.nonEmptyString,
  's3-prefix': t.nonEmptyString,
  'time-unit': t.nonEmptyString,
  'additional-artifacts': t.array(t.nonEmptyString),
  'refresh-closed-reports': t.boolean,
  'report-versioning': t.nonEmptyString,
});

export const ReportsConfigType = t.interface({
  'cost-and-usage-report': CostAndUsageReportConfigType,
});

export type GlobalOptionsZonesConfig = t.TypeOf<typeof GlobalOptionsZonesConfigType>;

export const SecurityHubFrameworksConfigType = t.interface({
  standards: t.array(
    t.interface({
      name: t.nonEmptyString,
      'controls-to-disable': t.optional(t.array(t.nonEmptyString)),
    }),
  ),
});

export type SecurityHubFrameworksConfig = t.TypeOf<typeof SecurityHubFrameworksConfigType>;

export const IamAccountPasswordPolicyType = t.interface({
  'allow-users-to-change-password': t.boolean,
  'hard-expiry': t.boolean,
  'require-uppercase-characters': t.boolean,
  'require-lowercase-characters': t.boolean,
  'require-symbols': t.boolean,
  'require-numbers': t.boolean,
  'minimum-password-length': t.number,
  'password-reuse-prevention': t.number,
  'max-password-age': t.number,
});

export const CwlExclusions = t.interface({
  account: t.nonEmptyString,
  exclusions: t.array(t.nonEmptyString),
});

export const CentralServicesConfigType = t.interface({
  account: t.nonEmptyString,
  region: t.nonEmptyString,
  'security-hub': t.defaulted(t.boolean, false),
  'security-hub-excl-regions': t.optional(t.array(t.nonEmptyString)),
  guardduty: t.defaulted(t.boolean, false),
  'guardduty-excl-regions': t.optional(t.array(t.nonEmptyString)),
  'guardduty-s3': t.defaulted(t.boolean, false),
  'guardduty-s3-excl-regions': t.optional(t.array(t.nonEmptyString)),
  'access-analyzer': t.defaulted(t.boolean, false),
  cwl: t.defaulted(t.boolean, false),
  'cwl-access-level': t.optional(t.nonEmptyString),
  'cwl-glbl-exclusions': t.optional(t.array(t.nonEmptyString)),
  'ssm-to-s3': t.defaulted(t.boolean, false),
  'ssm-to-cwl': t.defaulted(t.boolean, false),
  'cwl-exclusions': t.optional(t.array(CwlExclusions)),
  'kinesis-stream-shard-count': t.optional(t.number),
  macie: t.defaulted(t.boolean, false),
  'macie-excl-regions': t.optional(t.array(t.nonEmptyString)),
  'macie-frequency': t.optional(t.nonEmptyString),
  'config-excl-regions': t.optional(t.array(t.nonEmptyString)),
  'config-aggr-excl-regions': t.optional(t.array(t.nonEmptyString)),
  'sns-excl-regions': t.optional(t.array(t.nonEmptyString)),
  'sns-subscription-emails': t.defaulted(t.record(t.nonEmptyString, t.array(t.nonEmptyString)), {}),
  's3-retention': t.optional(t.number),
  'add-sns-topics': t.defaulted(t.boolean, false),
  'macie-sensitive-sh': t.defaulted(t.boolean, false),
  'fw-mgr-alert-level': t.defaulted(FirewallManagerAlertLevelType, 'Medium'),
  'security-hub-findings-sns': t.defaulted(SecurityHubFindingsSnsType, 'None'),
  'config-aggr': t.defaulted(t.boolean, false),
  'dynamic-s3-log-partitioning': t.optional(t.array(S3LogPartitionType)),
});

export type CentralServicesConfig = t.TypeOf<typeof CentralServicesConfigType>;

export const ScpsConfigType = t.interface({
  name: t.nonEmptyString,
  description: t.nonEmptyString,
  policy: t.nonEmptyString,
});
export type ScpConfig = t.TypeOf<typeof ScpsConfigType>;

export const FlowLogsFilterTypes = t.enums('FlowLogsFilterTypes', ['ACCEPT', 'REJECT', 'ALL']);
export type FlowLogsFilterTypes = t.TypeOf<typeof FlowLogsFilterTypes>;

export const FlowLogsIntervalTypes = t.enums('FlowLogsIntervalTypes', [60, 600]);
export type FlowLogsIntervalTypes = t.TypeOf<typeof FlowLogsIntervalTypes>;

export const VpcFlowLogsConfigType = t.interface({
  filter: FlowLogsFilterTypes,
  interval: FlowLogsIntervalTypes,
  'default-format': t.boolean,
  'custom-fields': t.array(t.nonEmptyString),
});
export type VpcFlowLogsConfig = t.TypeOf<typeof VpcFlowLogsConfigType>;

export const AdditionalCwlRegionType = t.interface({
  'kinesis-stream-shard-count': t.optional(t.number),
});

export type AdditionalCwlRegion = t.TypeOf<typeof AdditionalCwlRegionType>;

export type CloudWatchMetricFiltersConfig = t.TypeOf<typeof CloudWatchMetricFiltersConfigType>;

export const CloudWatchMetricFiltersConfigType = t.interface({
  'filter-name': t.nonEmptyString,
  accounts: t.array(t.nonEmptyString),
  regions: t.array(t.nonEmptyString),
  'loggroup-name': t.nonEmptyString,
  'filter-pattern': t.nonEmptyString,
  'metric-namespace': t.nonEmptyString,
  'metric-name': t.nonEmptyString,
  'metric-value': t.nonEmptyString,
  'default-value': t.optional(t.number),
});

export const CloudWatchAlarmDefinitionConfigType = t.interface({
  accounts: t.optional(t.array(t.nonEmptyString)),
  regions: t.optional(t.array(t.nonEmptyString)),
  namespace: t.optional(t.nonEmptyString),
  statistic: t.optional(t.nonEmptyString),
  period: t.optional(t.number),
  'threshold-type': t.optional(t.nonEmptyString),
  'comparison-operator': t.optional(t.nonEmptyString),
  threshold: t.optional(t.number),
  'evaluation-periods': t.optional(t.number),
  'treat-missing-data': t.optional(t.nonEmptyString),
  'alarm-name': t.nonEmptyString,
  'metric-name': t.nonEmptyString,
  'sns-alert-level': t.nonEmptyString,
  'alarm-description': t.nonEmptyString,
  'in-org-mgmt-use-lcl-sns': t.optional(t.boolean),
});

export type CloudWatchAlarmsConfig = t.TypeOf<typeof CloudWatchAlarmsConfigType>;

export const CloudWatchAlarmsConfigType = t.interface({
  'default-accounts': t.array(t.nonEmptyString),
  'default-regions': t.array(t.nonEmptyString),
  'default-namespace': t.nonEmptyString,
  'default-statistic': t.nonEmptyString,
  'default-period': t.number,
  'default-threshold-type': t.nonEmptyString,
  'default-comparison-operator': t.nonEmptyString,
  'default-threshold': t.number,
  'default-evaluation-periods': t.number,
  'default-treat-missing-data': t.nonEmptyString,
  'default-in-org-mgmt-use-lcl-sns': t.defaulted(t.boolean, false),
  definitions: t.array(CloudWatchAlarmDefinitionConfigType),
});

export const SsmDocument = t.interface({
  name: t.nonEmptyString,
  description: t.nonEmptyString,
  template: t.nonEmptyString,
});
export const SsmAutomation = t.interface({
  accounts: t.array(t.nonEmptyString),
  regions: t.array(t.nonEmptyString),
  documents: t.array(SsmDocument),
});

export const AwsConfigRuleDefaults = t.interface({
  remediation: t.boolean,
  'remediation-attempts': t.number,
  'remediation-retry-seconds': t.number,
  'remediation-concurrency': t.number,
});

export const AwsConfigRule = t.interface({
  name: t.nonEmptyString,
  remediation: t.optional(t.boolean),
  'remediation-attempts': t.optional(t.number),
  'remediation-retry-seconds': t.optional(t.number),
  'remediation-concurrency': t.optional(t.number),
  'remediation-action': t.optional(t.nonEmptyString),
  'remediation-params': t.defaulted(
    t.record(t.nonEmptyString, t.union([t.nonEmptyString, t.array(t.nonEmptyString)])),
    {},
  ),
  parameters: t.defaulted(t.record(t.nonEmptyString, t.nonEmptyString), {}),
  type: t.defaulted(ConfigRuleType, 'managed'),
  'max-frequency': t.optional(t.nonEmptyString),
  'resource-types': t.defaulted(t.array(t.nonEmptyString), []),
  runtime: t.optional(t.nonEmptyString),
  'runtime-path': t.optional(t.nonEmptyString),
});

export const AwsConfig = t.interface({
  defaults: AwsConfigRuleDefaults,
  rules: t.array(AwsConfigRule),
});

export const ReplacementString = t.nonEmptyString;
export const ReplacementStringArray = t.array(t.nonEmptyString);
export const ReplacementObjectValue = t.union([ReplacementString, ReplacementStringArray]);
export const ReplacementObject = t.record(t.nonEmptyString, ReplacementObjectValue);
export const ReplacementConfigValue = t.union([ReplacementString, ReplacementStringArray, ReplacementObject]);

export const ReplacementsConfig = t.record(t.string, ReplacementConfigValue);

export type ReplacementsConfig = t.TypeOf<typeof ReplacementsConfig>;

export const CidrPoolConfigType = t.interface({
  pool: t.nonEmptyString,
  region: t.nonEmptyString,
  cidr: t.cidr,
  description: t.optional(t.nonEmptyString),
});

export const GlobalOptionsConfigType = t.interface({
  'ct-baseline': t.boolean,
  'default-s3-retention': t.number,
  'central-bucket': t.nonEmptyString,
  reports: ReportsConfigType,
  'security-hub-frameworks': SecurityHubFrameworksConfigType,
  'central-security-services': CentralServicesConfigType,
  'central-operations-services': CentralServicesConfigType,
  'central-log-services': CentralServicesConfigType,
  'aws-org-management': CentralServicesConfigType,
  scps: t.array(ScpsConfigType),
  'organization-admin-role': t.optional(t.nonEmptyString),
  'supported-regions': t.array(t.nonEmptyString),
  'keep-default-vpc-regions': t.defaulted(t.array(t.nonEmptyString), []),
  'iam-password-policies': t.optional(IamAccountPasswordPolicyType),
  'default-cwl-retention': t.number,
  'ignored-ous': t.optional(t.array(t.nonEmptyString)),
  'install-cloudformation-master-role': t.defaulted(t.boolean, true),
  'workloadaccounts-prefix': t.optional(t.nonEmptyString),
  'workloadaccounts-suffix': t.optional(t.number),
  'workloadaccounts-param-filename': t.nonEmptyString,
  'vpc-flow-logs': VpcFlowLogsConfigType,
  'additional-cwl-regions': t.defaulted(t.record(t.nonEmptyString, AdditionalCwlRegionType), {}),
  'additional-global-output-regions': t.defaulted(t.array(t.nonEmptyString), []),
  'separate-s3-dp-org-trail': t.defaulted(t.boolean, false),
  cloudwatch: t.optional(
    t.interface({
      metrics: t.array(CloudWatchMetricFiltersConfigType),
      alarms: CloudWatchAlarmsConfigType,
    }),
  ),
  'ssm-automation': t.defaulted(t.array(SsmAutomation), []),
  'aws-config': t.optional(AwsConfig),
  'default-ssm-documents': t.defaulted(t.array(t.nonEmptyString), []),
  'endpoint-port-overrides': t.optional(t.record(t.nonEmptyString, t.array(t.nonEmptyString))),
  'control-tower-supported-regions': t.defaulted(t.array(t.nonEmptyString), []),
  'cidr-pools': t.defaulted(t.array(CidrPoolConfigType), []),
  'meta-data-collection': t.defaulted(t.boolean, false),
});

export type GlobalOptionsConfig = t.TypeOf<typeof GlobalOptionsConfigType>;

export const AcceleratorConfigType = t.interface({
  replacements: t.defaulted(ReplacementsConfig, {}),
  'global-options': GlobalOptionsConfigType,
  'mandatory-account-configs': AccountsConfigType,
  'workload-account-configs': AccountsConfigType,
  'organizational-units': OrganizationalUnitsConfigType,
});

export type AcceleratorConfigType = t.TypeOf<typeof AcceleratorConfigType>;
