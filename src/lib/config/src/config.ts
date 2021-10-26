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
import {
  availabilityZone,
  cidr,
  optional,
  region,
  enums,
  nonEmptyString,
  defaulted,
} from '@aws-accelerator/common-types';

export const MandatoryAccountType = enums('MandatoryAccountType', [
  'master',
  'central-security',
  'central-log',
  'central-operations',
]);
export type MandatoryAccountType = t.TypeOf<typeof MandatoryAccountType>;

export const ConfigRuleType = enums('ConfigRuleType', ['managed', 'custom']);
export type ConfigRuleType = t.TypeOf<typeof ConfigRuleType>;

export const VirtualPrivateGatewayConfig = t.interface({
  asn: optional(t.number),
});

export const PeeringConnectionConfig = t.interface({
  source: nonEmptyString,
  'source-vpc': nonEmptyString,
  'source-subnets': nonEmptyString,
  'local-subnets': nonEmptyString,
});

export const NatGatewayConfig = t.interface({
  subnet: t.interface({
    name: t.string,
    az: optional(availabilityZone),
  }),
});

export const AWSNetworkFirewallConfig = t.interface({
  'firewall-name': optional(t.string),
  subnet: t.interface({
    name: t.string,
    az: optional(availabilityZone),
  }),
  policy: t.interface({
    name: t.string,
    path: t.string,
  }),
});

export const AlbIpForwardingConfig = t.interface({
  'alb-forwarding': optional(t.boolean),
});

export const CidrConfigType = t.interface({
  value: optional(cidr),
  size: optional(t.number),
  pool: defaulted(t.string, 'main'),
});

export const SubnetDefinitionConfig = t.interface({
  az: availabilityZone,
  cidr: CidrConfigType,
  'route-table': nonEmptyString,
  disabled: defaulted(t.boolean, false),
});

export const NaclRuleCidrSourceConfig = t.interface({
  cidr: nonEmptyString,
});

export const NaclRuleSubnetSourceConfig = t.interface({
  account: optional(t.string),
  vpc: nonEmptyString,
  subnet: t.array(nonEmptyString),
});

export const NaclConfigType = t.interface({
  rule: t.number,
  protocol: t.number,
  ports: t.number,
  'rule-action': nonEmptyString,
  egress: t.boolean,
  'cidr-blocks': t.union([t.array(nonEmptyString), t.array(NaclRuleSubnetSourceConfig)]),
});

export type NaclConfig = t.TypeOf<typeof NaclConfigType>;

export const SubnetConfigType = t.interface({
  name: nonEmptyString,
  'share-to-ou-accounts': defaulted(t.boolean, false),
  'share-to-specific-accounts': optional(t.array(t.string)),
  definitions: t.array(SubnetDefinitionConfig),
  nacls: optional(t.array(NaclConfigType)),
});

export type SubnetConfig = t.TypeOf<typeof SubnetConfigType>;

export const GatewayEndpointType = enums('GatewayEndpointType', ['s3', 'dynamodb']);
export type GatewayEndpointType = t.TypeOf<typeof GatewayEndpointType>;

export const PcxRouteConfigType = t.interface({
  account: nonEmptyString,
  vpc: nonEmptyString,
  subnet: nonEmptyString,
});

export const RouteConfig = t.interface({
  destination: t.union([t.string, PcxRouteConfigType]), // TODO Can be string or destination in another account
  target: nonEmptyString,
  name: optional(t.string),
  az: optional(t.string),
  port: optional(t.string),
});

export const RouteTableConfigType = t.interface({
  name: nonEmptyString,
  routes: optional(t.array(RouteConfig)),
});

export const TransitGatewayAttachOption = nonEmptyString; // TODO Define all attach options here

export const TransitGatewayAttachConfigType = t.interface({
  'associate-to-tgw': t.string,
  account: t.string,
  'associate-type': optional(t.union([t.literal('ATTACH'), t.literal('VPN')])),
  'tgw-rt-associate': t.array(t.string),
  'tgw-rt-propagate': t.array(t.string),
  'blackhole-route': optional(t.boolean),
  'attach-subnets': optional(t.array(t.string)),
  options: optional(t.array(TransitGatewayAttachOption)),
});

export type TransitGatewayAttachConfig = t.TypeOf<typeof TransitGatewayAttachConfigType>;

export const TransitGatewayRouteConfigType = t.interface({
  destination: t.string,
  'target-tgw': optional(t.string),
  'target-vpc': optional(t.string),
  'target-vpn': optional(
    t.interface({
      name: t.string,
      az: t.string,
      subnet: t.string,
    }),
  ),
  'blackhole-route': optional(t.boolean),
});

export type TransitGatewayRouteConfig = t.TypeOf<typeof TransitGatewayRouteConfigType>;

export const TransitGatewayRouteTablesConfigType = t.interface({
  name: nonEmptyString,
  routes: optional(t.array(TransitGatewayRouteConfigType)),
});

export const TransitGatewayAttachDeploymentConfigType = t.interface({
  'associate-to-tgw': t.string,
  account: t.string,
  region: t.string,
  'tgw-rt-associate-local': t.array(t.string),
  'tgw-rt-associate-remote': t.array(t.string),
});

export type TransitGatewayRouteTablesConfig = t.TypeOf<typeof TransitGatewayRouteTablesConfigType>;
export type TransitGatewayAttachDeploymentConfig = t.TypeOf<typeof TransitGatewayAttachDeploymentConfigType>;

export const InterfaceEndpointName = t.string; // TODO Define all endpoints here

export const InterfaceEndpointConfig = t.interface({
  subnet: t.string,
  endpoints: t.array(InterfaceEndpointName),
  'allowed-cidrs': optional(t.array(cidr)),
});

export const ResolversConfigType = t.interface({
  subnet: nonEmptyString,
  outbound: t.boolean,
  inbound: t.boolean,
});

export type ResolversConfig = t.TypeOf<typeof ResolversConfigType>;

export const OnPremZoneConfigType = t.interface({
  zone: nonEmptyString,
  'outbound-ips': t.array(nonEmptyString),
});

export const SecurityGroupRuleCidrSourceConfig = t.interface({
  cidr: nonEmptyString,
});

export const SecurityGroupRuleSubnetSourceConfig = t.interface({
  account: optional(t.string),
  vpc: nonEmptyString,
  subnet: t.array(nonEmptyString),
});

export const SecurityGroupRuleSecurityGroupSourceConfig = t.interface({
  'security-group': t.array(nonEmptyString),
});

export const SecurityGroupRuleConfigType = t.interface({
  type: optional(t.array(nonEmptyString)),
  'tcp-ports': optional(t.array(t.number)),
  'udp-ports': optional(t.array(t.number)),
  port: optional(t.number),
  description: nonEmptyString,
  toPort: optional(t.number),
  fromPort: optional(t.number),
  source: t.union([
    t.array(nonEmptyString),
    t.array(SecurityGroupRuleSubnetSourceConfig),
    t.array(SecurityGroupRuleSecurityGroupSourceConfig),
  ]),
});

export type SecurityGroupRuleConfig = t.TypeOf<typeof SecurityGroupRuleConfigType>;

export const SecurityGroupConfigType = t.interface({
  name: nonEmptyString,
  'inbound-rules': t.array(SecurityGroupRuleConfigType),
  'outbound-rules': t.array(SecurityGroupRuleConfigType),
});

export const ZoneNamesConfigType = t.interface({
  public: defaulted(t.array(t.string), []),
  private: defaulted(t.array(t.string), []),
});

export const FlowLogsDestinationTypes = enums('FlowLogsDestinationTypes', ['S3', 'CWL', 'BOTH', 'NONE']);
export type FlowLogsDestinationTypes = t.TypeOf<typeof FlowLogsDestinationTypes>;

export const CidrSrcTypes = enums('CidrSrcTypes', ['provided', 'lookup', 'dynamic']);
export type CidrSrcTypes = t.TypeOf<typeof CidrSrcTypes>;

export const VpcConfigType = t.interface({
  deploy: t.string,
  name: t.string,
  region,
  cidr: t.array(CidrConfigType),
  'cidr-src': defaulted(CidrSrcTypes, 'provided'),
  'opt-in': defaulted(t.boolean, false),
  'dedicated-tenancy': defaulted(t.boolean, false),
  'use-central-endpoints': defaulted(t.boolean, false),
  'dns-resolver-logging': defaulted(t.boolean, false),
  'flow-logs': FlowLogsDestinationTypes,
  'log-retention': optional(t.number),
  igw: t.union([t.boolean, t.undefined]),
  vgw: t.union([VirtualPrivateGatewayConfig, t.boolean, t.undefined]),
  pcx: t.union([PeeringConnectionConfig, t.boolean, t.undefined]),
  natgw: t.union([NatGatewayConfig, t.boolean, t.undefined]),
  'alb-forwarding': t.union([AlbIpForwardingConfig, t.boolean, t.undefined]),
  nfw: t.union([AWSNetworkFirewallConfig, t.boolean, t.undefined]),
  subnets: optional(t.array(SubnetConfigType)),
  'gateway-endpoints': optional(t.array(GatewayEndpointType)),
  'route-tables': optional(t.array(RouteTableConfigType)),
  'tgw-attach': t.union([TransitGatewayAttachConfigType, t.boolean, t.undefined]),
  'interface-endpoints': t.union([InterfaceEndpointConfig, t.boolean, t.undefined]),
  resolvers: optional(ResolversConfigType),
  'on-premise-rules': optional(t.array(OnPremZoneConfigType)),
  'security-groups': optional(t.array(SecurityGroupConfigType)),
  zones: optional(ZoneNamesConfigType),
  'central-endpoint': defaulted(t.boolean, false),
});

export type VpcConfig = t.TypeOf<typeof VpcConfigType>;
export type SecurityGroupConfig = t.TypeOf<typeof SecurityGroupConfigType>;

export const IamUserConfigType = t.interface({
  'user-ids': t.array(nonEmptyString),
  group: nonEmptyString,
  policies: t.array(nonEmptyString),
  'boundary-policy': nonEmptyString,
});

export const IamPolicyConfigType = t.interface({
  'policy-name': nonEmptyString,
  policy: nonEmptyString,
});

// ssm-log-archive-access will be deprecated in a future release.
// ssm-log-archive-write-access should be used instead
export const IamRoleConfigType = t.interface({
  role: nonEmptyString,
  type: nonEmptyString,
  policies: t.array(nonEmptyString),
  'boundary-policy': nonEmptyString,
  'source-account': optional(t.string),
  'source-account-role': optional(t.string),
  'trust-policy': optional(t.string),
  'ssm-log-archive-access': optional(t.boolean),
  'ssm-log-archive-write-access': optional(t.boolean),
  'ssm-log-archive-read-only-access': optional(t.boolean),
});

export const IamConfigType = t.interface({
  users: optional(t.array(IamUserConfigType)),
  policies: optional(t.array(IamPolicyConfigType)),
  roles: optional(t.array(IamRoleConfigType)),
});

export type IamConfig = t.TypeOf<typeof IamConfigType>;

export const ImportCertificateConfigType = t.interface({
  name: t.string,
  type: t.literal('import'),
  'priv-key': t.string,
  cert: t.string,
  chain: optional(t.string),
});

export type ImportCertificateConfig = t.TypeOf<typeof ImportCertificateConfigType>;

export const CertificateValidationType = enums('CertificateValidation', ['DNS', 'EMAIL']);
export type CertificateValidationType = t.TypeOf<typeof CertificateValidationType>;

export type CertificateValidation = t.TypeOf<typeof CertificateValidationType>;

export const RequestCertificateConfigType = t.interface({
  name: t.string,
  type: t.literal('request'),
  domain: t.string,
  validation: CertificateValidationType,
  san: optional(t.array(nonEmptyString)),
});

export type RequestCertificateConfig = t.TypeOf<typeof RequestCertificateConfigType>;

export const CertificateConfigType = t.union([ImportCertificateConfigType, RequestCertificateConfigType]);

export type CertificateConfig = t.TypeOf<typeof CertificateConfigType>;

export const TgwDeploymentConfigType = t.interface({
  name: t.string,
  region: t.string,
  asn: optional(t.number),
  features: optional(
    t.interface({
      'DNS-support': t.boolean,
      'VPN-ECMP-support': t.boolean,
      'Default-route-table-association': t.boolean,
      'Default-route-table-propagation': t.boolean,
      'Auto-accept-sharing-attachments': t.boolean,
    }),
  ),
  'route-tables': optional(t.array(nonEmptyString)),
  'tgw-attach': optional(TransitGatewayAttachDeploymentConfigType),
  'tgw-routes': optional(t.array(TransitGatewayRouteTablesConfigType)),
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
  user: nonEmptyString,
  email: t.string,
  groups: t.array(t.string),
});

export const MadConfigType = t.interface({
  'dir-id': t.number,
  deploy: t.boolean,
  'vpc-name': t.string,
  region: t.string,
  subnet: t.string,
  azs: defaulted(t.array(t.string), []),
  size: t.string,
  'image-path': t.string,
  'dns-domain': t.string,
  'netbios-domain': t.string,
  'central-resolver-rule-account': t.string,
  'central-resolver-rule-vpc': t.string,
  'log-group-name': t.string,
  'share-to-account': optional(t.string),
  restrict_srcips: t.array(cidr),
  'rdgw-instance-type': t.string,
  'rdgw-instance-role': t.string,
  'num-rdgw-hosts': t.number,
  'rdgw-max-instance-age': t.number,
  'min-rdgw-hosts': t.number,
  'max-rdgw-hosts': t.number,
  'password-policies': PasswordPolicyType,
  'ad-groups': t.array(t.string),
  'ad-per-account-groups': t.array(t.string),
  'adc-group': t.string,
  'ad-users': t.array(ADUserConfig),
  'security-groups': t.array(SecurityGroupConfigType),
  'password-secret-name': optional(t.string),
});

export const RsyslogSubnetConfig = t.interface({
  name: t.string,
  az: t.string,
});

export const RsyslogConfig = t.interface({
  deploy: t.boolean,
  'vpc-name': t.string,
  region: t.string,
  'log-group-name': t.string,
  'security-groups': t.array(SecurityGroupConfigType),
  'app-subnets': t.array(RsyslogSubnetConfig),
  'web-subnets': t.array(RsyslogSubnetConfig),
  'min-rsyslog-hosts': t.number,
  'desired-rsyslog-hosts': t.number,
  'max-rsyslog-hosts': t.number,
  'ssm-image-id': t.string,
  'rsyslog-instance-type': t.string,
  'rsyslog-instance-role': t.string,
  'rsyslog-root-volume-size': t.number,
  'rsyslog-max-instance-age': t.number,
});

export const ElbTargetInstanceFirewallConfigType = t.interface({
  target: t.literal('firewall'),
  name: t.string,
  az: t.string,
});

export type ElbTargetInstanceFirewallConfig = t.TypeOf<typeof ElbTargetInstanceFirewallConfigType>;

// Could be a t.union in the future if we allow multiple config types
export const ElbTargetInstanceConfigType = ElbTargetInstanceFirewallConfigType;

export type ElbTargetInstanceConfig = t.TypeOf<typeof ElbTargetInstanceConfigType>;

export const ElbTargetConfigType = t.interface({
  'target-name': t.string,
  'target-type': t.string,
  protocol: optional(t.string),
  port: optional(t.number),
  'health-check-protocol': optional(t.string),
  'health-check-path': t.string,
  'health-check-port': optional(t.number),
  'lambda-filename': optional(t.string),
  'target-instances': optional(t.array(ElbTargetInstanceConfigType)),
  'tg-weight': optional(t.number),
});

export type ElbTargetConfig = t.TypeOf<typeof ElbTargetConfigType>;

export const ElbConfigType = t.interface({
  name: t.string,
  scheme: t.string,
  'action-type': t.string,
  'ip-type': t.string,
  listeners: t.string,
  ports: t.number,
  vpc: t.string,
  subnets: t.string,
  'cert-name': t.string,
  'cert-arn': optional(t.string),
  'security-policy': t.string,
  'security-group': t.string,
  'tg-stickiness': t.string,
  'target-alarms-notify': optional(t.string),
  'target-alarms-when': optional(t.string),
  'target-alarms-of': optional(t.string),
  'target-alarms-is': optional(t.string),
  'target-alarms-Count': optional(t.string),
  'target-alarms-for': optional(t.string),
  'target-alarms-periods-of': optional(t.string),
  'access-logs': t.boolean,
  targets: t.array(ElbTargetConfigType),
  'cross-zone': defaulted(t.boolean, false),
});

export const AccountConfigType = t.interface({
  // 'password-policies': PasswordPolicyType,
  'ad-groups': t.array(t.string),
  'adc-group': t.string,
  'ad-users': t.array(ADUserConfig),
});

export const AdcConfigType = t.interface({
  deploy: t.boolean,
  'vpc-name': t.string,
  subnet: t.string,
  azs: defaulted(t.array(t.string), []),
  size: t.string,
  restrict_srcips: t.array(cidr),
  'connect-account-key': t.string,
  'connect-dir-id': t.number,
});

export const FirewallPortConfigPrivateIpType = t.interface({
  az: t.string,
  ip: t.string,
});

export const FirewallPortConfigType = t.interface({
  name: t.string,
  subnet: t.string,
  'create-eip': t.boolean,
  'create-cgw': t.boolean,
  'private-ips': optional(t.array(FirewallPortConfigPrivateIpType)),
});

export const FirewallEC2ConfigType = t.interface({
  type: defaulted(t.literal('EC2'), 'EC2'),
  name: t.string,
  'instance-sizes': t.string,
  'image-id': t.string,
  region: t.string,
  vpc: t.string,
  'security-group': t.string,
  ports: t.array(FirewallPortConfigType),
  license: optional(t.array(t.string)),
  config: t.string,
  'fw-instance-role': t.string,
  'fw-cgw-name': t.string,
  'fw-cgw-asn': t.number,
  'fw-cgw-routing': t.string,
  'tgw-attach': t.union([TransitGatewayAttachConfigType, t.boolean, t.undefined]),
});

export type FirewallEC2ConfigType = t.TypeOf<typeof FirewallEC2ConfigType>;

export const FirewallCGWConfigType = t.interface({
  type: t.literal('CGW'),
  name: t.string,
  region: t.string,
  'fw-ips': t.array(t.string),
  'fw-cgw-name': t.string,
  'fw-cgw-asn': t.number,
  'fw-cgw-routing': t.string,
  'tgw-attach': t.union([TransitGatewayAttachConfigType, t.boolean, t.undefined]),
});

export type FirewallCGWConfigType = t.TypeOf<typeof FirewallCGWConfigType>;

export const FirewallManagerConfigType = t.interface({
  name: t.string,
  'instance-sizes': t.string,
  'image-id': t.string,
  region: t.string,
  vpc: t.string,
  'security-group': t.string,
  subnet: t.interface({
    name: t.string,
    az: t.string,
  }),
  'create-eip': t.boolean,
});

export type FirewallManagerConfig = t.TypeOf<typeof FirewallManagerConfigType>;

export const LandingZoneAccountType = enums('LandingZoneAccountConfigType', [
  'primary',
  'security',
  'log-archive',
  'shared-services',
]);
export type LandingZoneAccountType = t.TypeOf<typeof LandingZoneAccountType>;

export const BaseLineConfigType = enums('BaseLineConfigType', ['LANDING_ZONE', 'ORGANIZATIONS', 'CONTROL_TOWER']);
export type BaseLineType = t.TypeOf<typeof BaseLineConfigType>;

export const DeploymentConfigType = t.interface({
  tgw: optional(t.array(TgwDeploymentConfigType)),
  mad: optional(MadConfigType),
  rsyslog: optional(RsyslogConfig),
  adc: optional(AdcConfigType),
  firewalls: optional(t.array(t.union([FirewallEC2ConfigType, FirewallCGWConfigType]))),
  'firewall-manager': optional(FirewallManagerConfigType),
});

export type DeploymentConfig = t.TypeOf<typeof DeploymentConfigType>;

export const BudgetNotificationType = t.interface({
  type: t.string,
  'threshold-percent': t.number,
  emails: t.array(t.string),
});

export type BudgetConfig = t.TypeOf<typeof BudgetConfigType>;

export const BudgetConfigType = t.interface({
  name: t.string,
  period: t.string,
  amount: t.number,
  include: t.array(t.string),
  alerts: t.array(BudgetNotificationType),
});

export const LimitConfig = t.interface({
  value: t.number,
  'customer-confirm-inplace': defaulted(t.boolean, false),
});

export const SsmShareAutomation = t.interface({
  account: t.string,
  regions: t.array(t.string),
  documents: t.array(t.string),
});

export const AwsConfigRules = t.interface({
  'excl-regions': t.array(t.string),
  rules: t.array(t.string),
  'remediate-regions': optional(t.array(t.string)),
});

export const AwsConfigAccountConfig = t.interface({
  regions: t.array(t.string),
  'excl-rules': t.array(t.string),
});

export const MandatoryAccountConfigType = t.interface({
  'account-name': t.string,
  email: t.string,
  ou: t.string,
  'ou-path': optional(t.string),
  'share-mad-from': optional(t.string),
  'enable-s3-public-access': defaulted(t.boolean, false),
  iam: optional(IamConfigType),
  limits: defaulted(t.record(t.string, LimitConfig), {}),
  certificates: optional(t.array(CertificateConfigType)),
  vpc: optional(t.array(VpcConfigType)),
  deployments: optional(DeploymentConfigType),
  alb: optional(t.array(ElbConfigType)),
  's3-retention': optional(t.number),
  budget: optional(BudgetConfigType),
  'account-warming-required': optional(t.boolean),
  'cwl-retention': optional(t.number),
  deleted: defaulted(t.boolean, false),
  'src-filename': t.string,
  'exclude-ou-albs': optional(t.boolean),
  'keep-default-vpc-regions': defaulted(t.array(t.string), []),
  'populate-all-elbs-in-param-store': defaulted(t.boolean, false),
  'ssm-automation': defaulted(t.array(SsmShareAutomation), []),
  'aws-config': defaulted(t.array(AwsConfigAccountConfig), []),
  scps: optional(t.array(t.string)),
  'opt-in-vpcs': optional(t.array(t.string)),
});

export type MandatoryAccountConfig = t.TypeOf<typeof MandatoryAccountConfigType>;

export type AccountConfig = t.TypeOf<typeof MandatoryAccountConfigType>;

export const AccountsConfigType = t.record(t.string, MandatoryAccountConfigType);

export type AccountsConfig = t.TypeOf<typeof AccountsConfigType>;

export const OrganizationalUnitConfigType = t.interface({
  type: t.string,
  scps: t.array(t.string),
  'share-mad-from': optional(t.string),
  certificates: optional(t.array(CertificateConfigType)),
  iam: optional(IamConfigType),
  alb: optional(t.array(ElbConfigType)),
  vpc: optional(t.array(VpcConfigType)),
  'default-budgets': optional(BudgetConfigType),
  'ssm-automation': defaulted(t.array(SsmShareAutomation), []),
  'aws-config': defaulted(t.array(AwsConfigRules), []),
});

export type OrganizationalUnitConfig = t.TypeOf<typeof OrganizationalUnitConfigType>;

export const OrganizationalUnitsConfigType = t.record(t.string, OrganizationalUnitConfigType);

export type OrganizationalUnitsConfig = t.TypeOf<typeof OrganizationalUnitsConfigType>;

export type RouteTableConfig = t.TypeOf<typeof RouteTableConfigType>;
export type PcxRouteConfig = t.TypeOf<typeof PcxRouteConfigType>;

export const GlobalOptionsZonesConfigType = t.interface({
  account: nonEmptyString,
  'resolver-vpc': nonEmptyString,
  names: optional(ZoneNamesConfigType),
  region: nonEmptyString,
});

export const CostAndUsageReportConfigType = t.interface({
  'additional-schema-elements': t.array(t.string),
  compression: t.string,
  format: t.string,
  'report-name': t.string,
  's3-prefix': t.string,
  'time-unit': t.string,
  'additional-artifacts': t.array(t.string),
  'refresh-closed-reports': t.boolean,
  'report-versioning': t.string,
});

export const ReportsConfigType = t.interface({
  'cost-and-usage-report': CostAndUsageReportConfigType,
});

export type GlobalOptionsZonesConfig = t.TypeOf<typeof GlobalOptionsZonesConfigType>;

export const SecurityHubFrameworksConfigType = t.interface({
  standards: t.array(
    t.interface({
      name: t.string,
      'controls-to-disable': optional(t.array(t.string)),
    }),
  ),
});

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
  account: t.string,
  exclusions: t.array(t.string),
});

export const CentralServicesConfigType = t.interface({
  account: nonEmptyString,
  region: nonEmptyString,
  'security-hub': defaulted(t.boolean, false),
  'security-hub-excl-regions': optional(t.array(t.string)),
  guardduty: defaulted(t.boolean, false),
  'guardduty-excl-regions': optional(t.array(t.string)),
  'guardduty-s3': defaulted(t.boolean, false),
  'guardduty-s3-excl-regions': optional(t.array(t.string)),
  cwl: defaulted(t.boolean, false),
  'access-analyzer': defaulted(t.boolean, false),
  'cwl-access-level': optional(t.string),
  'cwl-glbl-exclusions': optional(t.array(t.string)),
  'ssm-to-s3': defaulted(t.boolean, false),
  'ssm-to-cwl': defaulted(t.boolean, false),
  'cwl-exclusions': optional(t.array(CwlExclusions)),
  'kinesis-stream-shard-count': optional(t.number),
  macie: defaulted(t.boolean, false),
  'macie-excl-regions': optional(t.array(t.string)),
  'macie-frequency': optional(t.string),
  'config-excl-regions': optional(t.array(t.string)),
  'config-aggr-excl-regions': optional(t.array(t.string)),
  'sns-excl-regions': optional(t.array(t.string)),
  'sns-subscription-emails': defaulted(t.record(t.string, t.array(t.string)), {}),
  's3-retention': optional(t.number),
});

export const ScpsConfigType = t.interface({
  name: nonEmptyString,
  description: nonEmptyString,
  policy: nonEmptyString,
});
export type ScpConfig = t.TypeOf<typeof ScpsConfigType>;

export const FlowLogsFilterTypes = enums('FlowLogsFilterTypes', ['ACCEPT', 'REJECT', 'ALL']);
export type FlowLogsFilterTypes = t.TypeOf<typeof FlowLogsFilterTypes>;

export const FlowLogsIntervalTypes = enums('FlowLogsIntervalTypes', [60, 600]);
export type FlowLogsIntervalTypes = t.TypeOf<typeof FlowLogsIntervalTypes>;

export const VpcFlowLogsConfigType = t.interface({
  filter: FlowLogsFilterTypes,
  interval: FlowLogsIntervalTypes,
  'default-format': t.boolean,
  'custom-fields': t.array(t.string),
});
export type VpcFlowLogsConfig = t.TypeOf<typeof VpcFlowLogsConfigType>;

export const AdditionalCwlRegionType = t.interface({
  'kinesis-stream-shard-count': optional(t.number),
});

export type AdditionalCwlRegion = t.TypeOf<typeof AdditionalCwlRegionType>;

export type CloudWatchMetricFiltersConfig = t.TypeOf<typeof CloudWatchMetricFiltersConfigType>;

export const CloudWatchMetricFiltersConfigType = t.interface({
  'filter-name': t.string,
  accounts: t.array(t.string),
  regions: t.array(t.string),
  'loggroup-name': t.string,
  'filter-pattern': t.string,
  'metric-namespace': t.string,
  'metric-name': t.string,
  'metric-value': t.string,
  'default-value': optional(t.number),
});

export const CloudWatchAlarmDefinitionConfigType = t.interface({
  accounts: optional(t.array(t.string)),
  regions: optional(t.array(t.string)),
  namespace: optional(t.string),
  statistic: optional(t.string),
  period: optional(t.number),
  'threshold-type': optional(t.string),
  'comparison-operator': optional(t.string),
  threshold: optional(t.number),
  'evaluation-periods': optional(t.number),
  'treat-missing-data': optional(t.string),
  'alarm-name': t.string,
  'metric-name': t.string,
  'sns-alert-level': t.string,
  'alarm-description': t.string,
});

export type CloudWatchAlarmsConfig = t.TypeOf<typeof CloudWatchAlarmsConfigType>;

export const CloudWatchAlarmsConfigType = t.interface({
  'default-accounts': t.array(t.string),
  'default-regions': t.array(t.string),
  'default-namespace': t.string,
  'default-statistic': t.string,
  'default-period': t.number,
  'default-threshold-type': t.string,
  'default-comparison-operator': t.string,
  'default-threshold': t.number,
  'default-evaluation-periods': t.number,
  'default-treat-missing-data': t.string,
  definitions: t.array(CloudWatchAlarmDefinitionConfigType),
});

export const SsmDocument = t.interface({
  name: t.string,
  description: t.string,
  template: t.string,
});
export const SsmAutomation = t.interface({
  accounts: t.array(t.string),
  regions: t.array(t.string),
  documents: t.array(SsmDocument),
});

export const AwsConfigRuleDefaults = t.interface({
  remediation: t.boolean,
  'remediation-attempts': t.number,
  'remediation-retry-seconds': t.number,
  'remediation-concurrency': t.number,
});

export const AwsConfigRule = t.interface({
  name: nonEmptyString,
  remediation: optional(t.boolean),
  'remediation-attempts': optional(t.number),
  'remediation-retry-seconds': optional(t.number),
  'remediation-concurrency': optional(t.number),
  'remediation-action': optional(t.string),
  'remediation-params': defaulted(t.record(t.string, t.union([t.string, t.array(t.string)])), {}),
  parameters: defaulted(t.record(t.string, t.string), {}),
  type: defaulted(ConfigRuleType, 'managed'),
  'max-frequency': optional(t.string),
  'resource-types': defaulted(t.array(t.string), []),
  runtime: optional(t.string),
  'runtime-path': optional(t.string),
});

export const AwsConfig = t.interface({
  defaults: AwsConfigRuleDefaults,
  rules: t.array(AwsConfigRule),
});

export const ReplacementConfigValueType = t.record(t.string, t.union([t.string, t.array(t.string)]));
export const ReplacementsConfigType = t.record(
  t.string,
  t.union([t.string, t.array(t.string), ReplacementConfigValueType]),
);

export const CidrPoolConfigType = t.interface({
  cidr,
  pool: t.string,
  region: t.string,
});
export const GlobalOptionsConfigType = t.interface({
  'ct-baseline': t.boolean,
  'default-s3-retention': t.number,
  'central-bucket': nonEmptyString,
  reports: ReportsConfigType,
  'security-hub-frameworks': SecurityHubFrameworksConfigType,
  'central-security-services': CentralServicesConfigType,
  'central-operations-services': CentralServicesConfigType,
  'central-log-services': CentralServicesConfigType,
  'aws-org-management': CentralServicesConfigType,
  scps: t.array(ScpsConfigType),
  'organization-admin-role': optional(t.string),
  'supported-regions': t.array(t.string),
  'keep-default-vpc-regions': defaulted(t.array(t.string), []),
  'iam-password-policies': optional(IamAccountPasswordPolicyType),
  'default-cwl-retention': t.number,
  'ignored-ous': optional(t.array(t.string)),
  'install-cloudformation-master-role': defaulted(t.boolean, true),
  'workloadaccounts-prefix': optional(t.string),
  'workloadaccounts-suffix': optional(t.number),
  'workloadaccounts-param-filename': t.string,
  'vpc-flow-logs': VpcFlowLogsConfigType,
  'additional-cwl-regions': defaulted(t.record(t.string, AdditionalCwlRegionType), {}),
  'additional-global-output-regions': defaulted(t.array(t.string), []),
  'separate-s3-dp-org-trail': defaulted(t.boolean, false),
  cloudwatch: optional(
    t.interface({
      metrics: t.array(CloudWatchMetricFiltersConfigType),
      alarms: CloudWatchAlarmsConfigType,
    }),
  ),
  'ssm-automation': defaulted(t.array(SsmAutomation), []),
  'aws-config': optional(AwsConfig),
  'default-ssm-documents': defaulted(t.array(t.string), []),
  'endpoint-port-overrides': optional(t.record(t.string, t.array(t.string))),
  'control-tower-supported-regions': defaulted(t.array(t.string), []),
  'cidr-pools': defaulted(t.array(CidrPoolConfigType), []),
});

export type CentralServicesConfig = t.TypeOf<typeof CentralServicesConfigType>;
export type SecurityHubFrameworksConfig = t.TypeOf<typeof SecurityHubFrameworksConfigType>;
export type GlobalOptionsConfig = t.TypeOf<typeof GlobalOptionsConfigType>;
export type ReplacementsConfig = t.TypeOf<typeof ReplacementsConfigType>;

export const AcceleratorConfigType = t.interface({
  replacements: defaulted(ReplacementsConfigType, {}),
  'global-options': GlobalOptionsConfigType,
  'mandatory-account-configs': AccountsConfigType,
  'workload-account-configs': AccountsConfigType,
  'organizational-units': OrganizationalUnitsConfigType,
});

export type OrganizationalUnit = t.TypeOf<typeof OrganizationalUnitConfigType>;

export type MadDeploymentConfig = t.TypeOf<typeof MadConfigType>;

export type RsyslogConfig = t.TypeOf<typeof RsyslogConfig>;

export type ElbConfig = t.TypeOf<typeof ElbConfigType>;
