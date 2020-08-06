import * as t from 'io-ts';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';
import { fromNullable } from 'io-ts-types/lib/fromNullable';
import { availabilityZone, cidr, optional, region, enumType, parse } from '@aws-pbmm/common-types';

export const MANDATORY_ACCOUNT_TYPES = ['master', 'central-security', 'central-log', 'central-operations'] as const;

export type MandatoryAccountType = typeof MANDATORY_ACCOUNT_TYPES[number];

export const VirtualPrivateGatewayConfig = t.interface({
  asn: optional(t.number),
});

export const PeeringConnectionConfig = t.interface({
  source: NonEmptyString,
  'source-vpc': NonEmptyString,
  'source-subnets': NonEmptyString,
  'local-subnets': NonEmptyString,
});

export const NatGatewayConfig = t.interface({
  subnet: t.interface({
    name: t.string,
    az: optional(availabilityZone),
  }),
});

export const SubnetDefinitionConfig = t.interface({
  az: availabilityZone,
  cidr: optional(cidr),
  cidr2: optional(cidr),
  'route-table': NonEmptyString,
  disabled: fromNullable(t.boolean, false),
});

export const NaclRuleCidrSourceConfig = t.interface({
  cidr: NonEmptyString,
});

export const NaclRuleSubnetSourceConfig = t.interface({
  account: optional(t.string),
  vpc: NonEmptyString,
  subnet: t.array(NonEmptyString),
});

export const NaclConfigType = t.interface({
  rule: t.number,
  protocol: t.number,
  ports: t.number,
  'rule-action': NonEmptyString,
  egress: t.boolean,
  'cidr-blocks': t.union([t.array(NonEmptyString), t.array(NaclRuleSubnetSourceConfig)]),
});

export type NaclConfig = t.TypeOf<typeof NaclConfigType>;

export const SubnetConfigType = t.interface({
  name: NonEmptyString,
  'share-to-ou-accounts': fromNullable(t.boolean, false),
  'share-to-specific-accounts': optional(t.array(t.string)),
  definitions: t.array(SubnetDefinitionConfig),
  nacls: optional(t.array(NaclConfigType)),
});

export type SubnetConfig = t.TypeOf<typeof SubnetConfigType>;

export const GATEWAY_ENDPOINT_TYPES = ['s3', 'dynamodb'] as const;

export const GatewayEndpointType = enumType<typeof GATEWAY_ENDPOINT_TYPES[number]>(GATEWAY_ENDPOINT_TYPES);

export const PcxRouteConfigType = t.interface({
  account: NonEmptyString,
  vpc: NonEmptyString,
  subnet: NonEmptyString,
});

export const RouteConfig = t.interface({
  destination: t.union([t.string, PcxRouteConfigType]), // TODO Can be string or destination in another account
  target: NonEmptyString,
  name: optional(t.string),
  az: optional(t.string),
  port: optional(t.string),
});

export const RouteTableConfigType = t.interface({
  name: NonEmptyString,
  routes: optional(t.array(RouteConfig)),
});

export const TransitGatewayAttachOption = NonEmptyString; // TODO Define all attach options here

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

export const InterfaceEndpointName = t.string; // TODO Define all endpoints here

export const InterfaceEndpointConfig = t.interface({
  subnet: t.string,
  endpoints: t.array(InterfaceEndpointName),
});

export const ResolversConfigType = t.interface({
  subnet: NonEmptyString,
  outbound: t.boolean,
  inbound: t.boolean,
});

export type ResolversConfig = t.TypeOf<typeof ResolversConfigType>;

export const OnPremZoneConfigType = t.interface({
  zone: NonEmptyString,
  'outbound-ips': t.array(NonEmptyString),
});

export const SecurityGroupRuleCidrSourceConfig = t.interface({
  cidr: NonEmptyString,
});

export const SecurityGroupRuleSubnetSourceConfig = t.interface({
  account: optional(t.string),
  vpc: NonEmptyString,
  subnet: t.array(NonEmptyString),
});

export const SecurityGroupRuleSecurityGroupSourceConfig = t.interface({
  'security-group': t.array(NonEmptyString),
});

export const SecurityGroupRuleConfigType = t.interface({
  type: optional(t.array(NonEmptyString)),
  'tcp-ports': optional(t.array(t.number)),
  'udp-ports': optional(t.array(t.number)),
  port: optional(t.number),
  description: NonEmptyString,
  toPort: optional(t.number),
  fromPort: optional(t.number),
  source: t.union([
    t.array(NonEmptyString),
    t.array(SecurityGroupRuleSubnetSourceConfig),
    t.array(SecurityGroupRuleSecurityGroupSourceConfig),
  ]),
});

export type SecurityGroupRuleConfig = t.TypeOf<typeof SecurityGroupRuleConfigType>;

export const SecurityGroupConfigType = t.interface({
  name: NonEmptyString,
  'inbound-rules': t.array(SecurityGroupRuleConfigType),
  'outbound-rules': t.array(SecurityGroupRuleConfigType),
});

export const VpcConfigType = t.interface({
  deploy: t.string,
  name: t.string,
  region,
  cidr,
  cidr2: optional(cidr),
  'use-central-endpoints': fromNullable(t.boolean, false),
  'flow-logs': fromNullable(t.boolean, false),
  'log-retention': optional(t.number),
  igw: t.union([t.boolean, t.undefined]),
  vgw: t.union([VirtualPrivateGatewayConfig, t.boolean, t.undefined]),
  pcx: t.union([PeeringConnectionConfig, t.boolean, t.undefined]),
  natgw: t.union([NatGatewayConfig, t.boolean, t.undefined]),
  subnets: optional(t.array(SubnetConfigType)),
  'gateway-endpoints': optional(t.array(GatewayEndpointType)),
  'route-tables': optional(t.array(RouteTableConfigType)),
  'tgw-attach': t.union([TransitGatewayAttachConfigType, t.boolean, t.undefined]),
  'interface-endpoints': t.union([InterfaceEndpointConfig, t.boolean, t.undefined]),
  resolvers: optional(ResolversConfigType),
  'on-premise-rules': optional(t.array(OnPremZoneConfigType)),
  'security-groups': optional(t.array(SecurityGroupConfigType)),
});

export type VpcConfig = t.TypeOf<typeof VpcConfigType>;
export type SecurityGroupConfig = t.TypeOf<typeof SecurityGroupConfigType>;

export const IamUserConfigType = t.interface({
  'user-ids': t.array(NonEmptyString),
  group: NonEmptyString,
  policies: t.array(NonEmptyString),
  'boundary-policy': NonEmptyString,
});

export const IamPolicyConfigType = t.interface({
  'policy-name': NonEmptyString,
  policy: NonEmptyString,
});

export const IamRoleConfigType = t.interface({
  role: NonEmptyString,
  type: NonEmptyString,
  policies: t.array(NonEmptyString),
  'boundary-policy': NonEmptyString,
  'source-account': optional(t.string),
  'source-account-role': optional(t.string),
  'trust-policy': optional(t.string),
  'ssm-log-archive-access': optional(t.boolean),
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

export const CERTIFICATE_VALIDATION = ['DNS', 'EMAIL'] as const;

export const CertificateValidationType = enumType<typeof CERTIFICATE_VALIDATION[number]>(
  CERTIFICATE_VALIDATION,
  'CertificateValidation',
);

export type CertificateValidation = t.TypeOf<typeof CertificateValidationType>;

export const RequestCertificateConfigType = t.interface({
  name: t.string,
  type: t.literal('request'),
  domain: t.string,
  validation: CertificateValidationType,
  san: optional(t.array(NonEmptyString)),
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
    }),
  ),
  'route-tables': optional(t.array(NonEmptyString)),
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
  user: NonEmptyString,
  email: t.string,
  groups: t.array(t.string),
});

export const MadConfigType = t.interface({
  'dir-id': t.number,
  deploy: t.boolean,
  'vpc-name': t.string,
  region: t.string,
  subnet: t.string,
  size: t.string,
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

export const AlbTargetInstanceFirewallConfigType = t.interface({
  target: t.literal('firewall'),
  name: t.string,
  az: t.string,
});

export type AlbTargetInstanceFirewallConfig = t.TypeOf<typeof AlbTargetInstanceFirewallConfigType>;

// Could be a t.union in the future if we allow multiple config types
export const AlbTargetInstanceConfigType = AlbTargetInstanceFirewallConfigType;

export type AlbTargetInstanceConfig = t.TypeOf<typeof AlbTargetInstanceConfigType>;

export const AlbTargetConfigType = t.interface({
  'target-name': t.string,
  'target-type': t.string,
  protocol: optional(t.string),
  port: optional(t.number),
  'health-check-protocol': optional(t.string),
  'health-check-path': t.string,
  'health-check-port': optional(t.number),
  'lambda-filename': optional(t.string),
  'target-instances': optional(t.array(AlbTargetInstanceConfigType)),
  'tg-weight': optional(t.number),
});

export type AlbTargetConfig = t.TypeOf<typeof AlbTargetConfigType>;

export const AlbConfigType = t.interface({
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
  targets: t.array(AlbTargetConfigType),
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
  size: t.string,
  restrict_srcips: t.array(cidr),
  'connect-account-key': t.string,
  'connect-dir-id': t.number,
});

export const FirewallPortConfigType = t.interface({
  name: t.string,
  subnet: t.string,
  'create-eip': t.boolean,
  'create-cgw': t.boolean,
});

export const FirewallConfigType = t.interface({
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

export type FirewallConfig = t.TypeOf<typeof FirewallConfigType>;

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

export const LANDING_ZONE_ACCOUNT_TYPES = ['primary', 'security', 'log-archive', 'shared-services'] as const;

export const LandingZoneAccountConfigType = enumType<typeof LANDING_ZONE_ACCOUNT_TYPES[number]>(
  LANDING_ZONE_ACCOUNT_TYPES,
);

export type LandingZoneAccountType = t.TypeOf<typeof LandingZoneAccountConfigType>;

export const BASELINE_TYPES = ['LANDING_ZONE', 'ORGANIZATIONS', 'CONTROL_TOWER'] as const;
export const BaseLineConfigType = enumType<typeof BASELINE_TYPES[number]>(BASELINE_TYPES);
export type BaseLineType = t.TypeOf<typeof BaseLineConfigType>;

export const DeploymentConfigType = t.interface({
  tgw: optional(t.array(TgwDeploymentConfigType)),
  mad: optional(MadConfigType),
  rsyslog: optional(RsyslogConfig),
  adc: optional(AdcConfigType),
  firewalls: optional(t.array(FirewallConfigType)),
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
  'customer-confirm-inplace': fromNullable(t.boolean, false),
});

export const MandatoryAccountConfigType = t.interface({
  'landing-zone-account-type': optional(LandingZoneAccountConfigType),
  'account-name': t.string,
  email: t.string,
  ou: t.string,
  'ou-path': optional(t.string),
  'share-mad-from': optional(t.string),
  'enable-s3-public-access': fromNullable(t.boolean, false),
  iam: optional(IamConfigType),
  limits: fromNullable(t.record(t.string, LimitConfig), {}),
  certificates: optional(t.array(CertificateConfigType)),
  vpc: optional(t.array(VpcConfigType)),
  deployments: optional(DeploymentConfigType),
  alb: optional(t.array(AlbConfigType)),
  'log-retention': optional(t.number),
  budget: optional(BudgetConfigType),
  'account-warming-required': optional(t.boolean),
  'cwl-retention': optional(t.number),
  deleted: fromNullable(t.boolean, false),
  'file-name': t.string,
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
  alb: optional(t.array(AlbConfigType)),
  vpc: optional(t.array(VpcConfigType)),
  'default-budgets': optional(BudgetConfigType),
});

export type OrganizationalUnitConfig = t.TypeOf<typeof OrganizationalUnitConfigType>;

export const OrganizationalUnitsConfigType = t.record(t.string, OrganizationalUnitConfigType);

export type OrganizationalUnitsConfig = t.TypeOf<typeof OrganizationalUnitsConfigType>;

export type RouteTableConfig = t.TypeOf<typeof RouteTableConfigType>;
export type PcxRouteConfig = t.TypeOf<typeof PcxRouteConfigType>;

export const ZoneNamesConfigType = t.interface({
  public: t.array(t.string),
  private: t.array(t.string),
});

export const GlobalOptionsZonesConfigType = t.interface({
  account: NonEmptyString,
  'resolver-vpc': NonEmptyString,
  names: ZoneNamesConfigType,
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
  account: NonEmptyString,
  region: NonEmptyString,
  'security-hub': fromNullable(t.boolean, false),
  guardduty: fromNullable(t.boolean, false),
  'guardduty-excl-regions': optional(t.array(t.string)),
  cwl: fromNullable(t.boolean, false),
  'access-analyzer': fromNullable(t.boolean, false),
  'cwl-access-level': optional(t.string),
  'cwl-glbl-exclusions': optional(t.array(t.string)),
  'ssm-to-s3': optional(t.boolean),
  'ssm-to-cwl': optional(t.boolean),
  'cwl-exclusions': optional(t.array(CwlExclusions)),
  'kinesis-stream-shard-count': optional(t.number),
  macie: fromNullable(t.boolean, false),
  'macie-excl-regions': optional(t.array(t.string)),
  'macie-frequency': optional(t.string),
  'config-excl-regions': optional(t.array(t.string)),
  'config-aggr-excl-regions': optional(t.array(t.string)),
});

export const ScpsConfigType = t.interface({
  name: NonEmptyString,
  description: NonEmptyString,
  policy: NonEmptyString,
});

export type ScpConfig = t.TypeOf<typeof ScpsConfigType>;

export const GlobalOptionsConfigType = t.interface({
  'alz-baseline': t.boolean,
  'ct-baseline': t.boolean,
  'central-log-retention': t.number,
  'default-log-retention': t.number,
  'central-bucket': NonEmptyString,
  reports: ReportsConfigType,
  zones: GlobalOptionsZonesConfigType,
  'security-hub-frameworks': SecurityHubFrameworksConfigType,
  'central-security-services': CentralServicesConfigType,
  'central-operations-services': CentralServicesConfigType,
  'central-log-services': CentralServicesConfigType,
  'aws-org-master': CentralServicesConfigType,
  scps: t.array(ScpsConfigType),
  'organization-admin-role': optional(t.string),
  'supported-regions': t.array(t.string),
  'keep-default-vpc-regions': fromNullable(t.array(t.string), []),
  'iam-password-policies': optional(IamAccountPasswordPolicyType),
  'default-cwl-retention': t.number,
  'ignored-ous': optional(t.array(t.string)),
  'install-cloudformation-master-role': fromNullable(t.boolean, true),
  'workloadaccounts-prefix': optional(t.string),
  'workloadaccounts-suffix': optional(t.number),
  'workloadaccount-suffix-file-name': t.string,
});

export type CentralServicesConfig = t.TypeOf<typeof CentralServicesConfigType>;
export type SecurityHubFrameworksConfig = t.TypeOf<typeof SecurityHubFrameworksConfigType>;
export type GlobalOptionsConfig = t.TypeOf<typeof GlobalOptionsConfigType>;

export const AcceleratorConfigType = t.interface({
  'global-options': GlobalOptionsConfigType,
  'mandatory-account-configs': AccountsConfigType,
  'workload-account-configs': AccountsConfigType,
  'organizational-units': OrganizationalUnitsConfigType,
});

export type OrganizationalUnit = t.TypeOf<typeof OrganizationalUnitConfigType>;

export type MadDeploymentConfig = t.TypeOf<typeof MadConfigType>;

export type RsyslogConfig = t.TypeOf<typeof RsyslogConfig>;

export type AlbConfig = t.TypeOf<typeof AlbConfigType>;

export interface ResolvedConfigBase {
  /**
   * The organizational unit to which this VPC belongs.
   */
  ouKey?: string;
  /**
   * The resolved account key where the VPC should be deployed.
   */
  accountKey: string;
}

export interface ResolvedVpcConfig extends ResolvedConfigBase {
  /**
   * The VPC config to be deployed.
   */
  vpcConfig: VpcConfig;
  /**
   * Deployment config
   */
  deployments?: DeploymentConfig;
}

export interface ResolvedCertificateConfig extends ResolvedConfigBase {
  /**
   * The certificates config to be deployed.
   */
  certificates: CertificateConfig[];
}

export interface ResolvedIamConfig extends ResolvedConfigBase {
  /**
   * The IAM config to be deployed.
   */
  iam: IamConfig;
}

export interface ResolvedAlbConfig extends ResolvedConfigBase {
  /**
   * The albs config to be deployed.
   */
  albs: AlbConfig[];
}

export class AcceleratorConfig implements t.TypeOf<typeof AcceleratorConfigType> {
  readonly 'global-options': GlobalOptionsConfig;
  readonly 'mandatory-account-configs': AccountsConfig;
  readonly 'workload-account-configs': AccountsConfig;
  readonly 'organizational-units': OrganizationalUnitsConfig;

  constructor(values: t.TypeOf<typeof AcceleratorConfigType>) {
    Object.assign(this, values);
  }

  /**
   * @return AccountConfig
   */
  getAccountByKey(accountKey: string): AccountConfig {
    return this['mandatory-account-configs'][accountKey] ?? this['workload-account-configs'][accountKey];
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getAccountByLandingZoneAccountType(
    type: typeof LANDING_ZONE_ACCOUNT_TYPES[number],
  ): [string, AccountConfig] | undefined {
    return this.getMandatoryAccountConfigs().find(
      ([_, accountConfig]) => accountConfig['landing-zone-account-type'] === type,
    );
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getMandatoryAccountConfigs(): [string, AccountConfig][] {
    return Object.entries(this['mandatory-account-configs']);
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getWorkloadAccountConfigs(): [string, AccountConfig][] {
    return Object.entries(this['workload-account-configs']).filter(([_, value]) => !value.deleted);
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getAccountConfigs(): [string, AccountConfig][] {
    return [...this.getMandatoryAccountConfigs(), ...this.getWorkloadAccountConfigs()];
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getAccountConfigsForOu(ou: string): [string, AccountConfig][] {
    return this.getAccountConfigs().filter(([_, accountConfig]) => accountConfig.ou === ou);
  }

  /**
   * @return [accountKey: string, accountConfig: AccountConfig][]
   */
  getOrganizationalUnits(): [string, OrganizationalUnitConfig][] {
    return Object.entries(this['organizational-units']);
  }

  /**
   * @return string // Account Key for Mandatory accounts
   */
  getMandatoryAccountKey(accountName: MandatoryAccountType): string {
    if (accountName === 'master') {
      return this['global-options']['aws-org-master'].account;
    } else if (accountName === 'central-security') {
      return this['global-options']['central-security-services'].account;
    } else if (accountName === 'central-operations') {
      return this['global-options']['central-operations-services'].account;
    } else if (accountName === 'central-log') {
      return this['global-options']['central-log-services'].account;
    } else {
      // Invalid account name
      throw new Error(`Invalid Account Type sent to "getMandatoryAccountKey"`);
    }
  }

  /**
   * Find all VPC configurations in mandatory accounts, workload accounts and organizational units. VPC configuration in
   * organizational units will have the correct `accountKey` based on the `deploy` value of the VPC configuration.
   */
  getVpcConfigs(): ResolvedVpcConfig[] {
    const vpcConfigs: ResolvedVpcConfig[] = [];

    // Add mandatory account VPC configuration first
    for (const [accountKey, accountConfig] of this.getMandatoryAccountConfigs()) {
      for (const vpcConfig of accountConfig.vpc || []) {
        vpcConfigs.push({
          accountKey,
          vpcConfig,
          deployments: accountConfig.deployments,
        });
      }
    }

    const prioritizedOus = this.getOrganizationalUnits();
    // Sort OUs by OU priority
    // Config for mandatory OUs should be first in the list
    prioritizedOus.sort(([_, ou1], [__, ou2]) => priorityByOuType(ou1, ou2));

    for (const [ouKey, ouConfig] of prioritizedOus) {
      for (const vpcConfig of ouConfig.vpc || []) {
        const destinationAccountKey = vpcConfig.deploy;
        if (destinationAccountKey === 'local') {
          // When deploy is 'local' then the VPC should be deployed in all accounts in the OU
          for (const [accountKey, accountConfig] of this.getAccountConfigsForOu(ouKey)) {
            vpcConfigs.push({
              ouKey,
              accountKey,
              vpcConfig,
              deployments: accountConfig.deployments,
            });
          }
        } else {
          // When deploy is not 'local' then the VPC should only be deployed in the given account
          vpcConfigs.push({
            ouKey,
            accountKey: destinationAccountKey,
            vpcConfig,
          });
        }
      }
    }

    // Add workload accounts as they are lower priority
    for (const [accountKey, accountConfig] of this.getWorkloadAccountConfigs()) {
      for (const vpcConfig of accountConfig.vpc || []) {
        vpcConfigs.push({
          accountKey,
          vpcConfig,
          deployments: accountConfig.deployments,
        });
      }
    }

    return vpcConfigs;
  }

  /**
   * Find all VPC configurations in mandatory accounts, workload accounts and organizational units. VPC configuration in
   * organizational units will have the correct `accountKey` based on the `deploy` value of the VPC configuration.
   */
  getVpcConfigs2(): ResolvedVpcConfig[] {
    const result: ResolvedVpcConfig[] = [];
    for (const [key, config] of this.getAccountAndOuConfigs()) {
      const vpcConfigs = config.vpc;
      if (!vpcConfigs || vpcConfigs.length === 0) {
        continue;
      }
      if (MandatoryAccountConfigType.is(config)) {
        for (const vpcConfig of vpcConfigs) {
          result.push({
            accountKey: key,
            vpcConfig,
            deployments: config.deployments,
          });
        }
      } else if (OrganizationalUnitConfigType.is(config)) {
        for (const vpcConfig of vpcConfigs) {
          const destinationAccountKey = vpcConfig.deploy;
          if (destinationAccountKey === 'local') {
            // When deploy is 'local' then the VPC should be deployed in all accounts in the OU
            for (const [accountKey, accountConfig] of this.getAccountConfigsForOu(key)) {
              result.push({
                ouKey: key,
                accountKey,
                vpcConfig,
                deployments: accountConfig.deployments,
              });
            }
          } else {
            // When deploy is not 'local' then the VPC should only be deployed in the given account
            result.push({
              ouKey: key,
              accountKey: destinationAccountKey,
              vpcConfig,
            });
          }
        }
      }
    }
    return result;
  }

  /**
   * Find all certificate configurations in mandatory accounts, workload accounts and organizational units.
   */
  getCertificateConfigs(): ResolvedCertificateConfig[] {
    const result: ResolvedCertificateConfig[] = [];
    for (const [key, config] of this.getAccountAndOuConfigs()) {
      const certificates = config.certificates;
      if (!certificates || certificates.length === 0) {
        continue;
      }
      if (MandatoryAccountConfigType.is(config)) {
        result.push({
          accountKey: key,
          certificates,
        });
      } else if (OrganizationalUnitConfigType.is(config)) {
        for (const [accountKey, _] of this.getAccountConfigsForOu(key)) {
          result.push({
            ouKey: key,
            accountKey,
            certificates,
          });
        }
      }
    }
    return result;
  }

  /**
   * Find all IAM configurations in mandatory accounts, workload accounts and organizational units.
   */
  getIamConfigs(): ResolvedIamConfig[] {
    const result: ResolvedIamConfig[] = [];
    for (const [key, config] of this.getAccountAndOuConfigs()) {
      const iam = config.iam;
      if (!iam) {
        continue;
      }
      if (MandatoryAccountConfigType.is(config)) {
        result.push({
          accountKey: key,
          iam,
        });
      } else if (OrganizationalUnitConfigType.is(config)) {
        for (const [accountKey, _] of this.getAccountConfigsForOu(key)) {
          result.push({
            ouKey: key,
            accountKey,
            iam,
          });
        }
      }
    }
    return result;
  }

  /**
   * Find all alb configurations in mandatory accounts, workload accounts and organizational units.
   */
  getAlbConfigs(): ResolvedAlbConfig[] {
    const result: ResolvedAlbConfig[] = [];
    for (const [key, config] of this.getAccountAndOuConfigs()) {
      const albs = config.alb;
      if (!albs || albs.length === 0) {
        continue;
      }
      if (MandatoryAccountConfigType.is(config)) {
        result.push({
          accountKey: key,
          albs,
        });
      } else if (OrganizationalUnitConfigType.is(config)) {
        for (const [accountKey, _] of this.getAccountConfigsForOu(key)) {
          result.push({
            ouKey: key,
            accountKey,
            albs,
          });
        }
      }
    }
    return result;
  }

  /**
   * Iterate all account configs and organizational unit configs in order.
   */
  private *getAccountAndOuConfigs(): IterableIterator<[string, MandatoryAccountConfig | OrganizationalUnitConfig]> {
    // Add mandatory account VPC configuration first
    for (const [accountKey, accountConfig] of this.getMandatoryAccountConfigs()) {
      yield [accountKey, accountConfig];
    }

    const prioritizedOus = this.getOrganizationalUnits();
    // Sort OUs by OU priority
    // Config for mandatory OUs should be first in the list
    prioritizedOus.sort(([_, ou1], [__, ou2]) => priorityByOuType(ou1, ou2));

    for (const [ouKey, ouConfig] of prioritizedOus) {
      yield [ouKey, ouConfig];
    }

    // Add workload accounts as they are lower priority
    for (const [accountKey, accountConfig] of this.getWorkloadAccountConfigs()) {
      yield [accountKey, accountConfig];
    }
  }

  static fromBuffer(content: Buffer): AcceleratorConfig {
    return this.fromString(content.toString());
  }

  static fromString(content: string): AcceleratorConfig {
    return this.fromObject(JSON.parse(content));
  }

  static fromObject<S>(content: S): AcceleratorConfig {
    const values = parse(AcceleratorConfigType, content);
    return new AcceleratorConfig(values);
  }
}

function priorityByOuType(ou1: OrganizationalUnit, ou2: OrganizationalUnit) {
  // Mandatory has highest priority
  if (ou1.type === 'mandatory') {
    return -1;
  }
  return 1;
}

export class AcceleratorUpdateConfig extends AcceleratorConfig {
  'global-options': GlobalOptionsConfig;
  'mandatory-account-configs': AccountsConfig;
  'workload-account-configs': AccountsConfig;
  'organizational-units': OrganizationalUnitsConfig;

  constructor(values: t.TypeOf<typeof AcceleratorConfigType>) {
    super(values);
    Object.assign(this, values);
  }
}
