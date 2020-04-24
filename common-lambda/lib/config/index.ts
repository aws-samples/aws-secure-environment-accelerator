import * as t from 'io-ts';
import { availabilityZone, cidr, optional, region, enumType } from './types';
import { PathReporter } from './reporter';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';
import { fromNullable } from 'io-ts-types/lib/fromNullable';
import { isLeft } from 'fp-ts/lib/Either';

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
    az: t.string,
  }),
});

export const SubnetDefinitionConfig = t.interface({
  az: availabilityZone,
  cidr: optional(cidr),
  cidr2: optional(cidr),
  'route-table': NonEmptyString,
  disabled: fromNullable(t.boolean, false),
});

export const SubnetConfig = t.interface({
  name: NonEmptyString,
  'share-to-ou-accounts': fromNullable(t.boolean, false),
  'share-to-specific-accounts': optional(t.array(t.string)),
  definitions: t.array(SubnetDefinitionConfig),
});

export const GATEWAY_ENDPOINT_TYPES = ['s3', 'dynamodb'] as const;

export const GatewayEndpointType = enumType<typeof GATEWAY_ENDPOINT_TYPES[number]>(GATEWAY_ENDPOINT_TYPES);

export const RouteConfig = t.interface({
  destination: t.unknown, // TODO Can be string or destination in another account
  target: NonEmptyString,
});

export const RouteTableConfig = t.interface({
  name: NonEmptyString,
  routes: optional(t.array(RouteConfig)),
});

export const TransitGatewayAttachOption = NonEmptyString; // TODO Define all attach options here

export const TransitGatewayAttachConfig = t.interface({
  'associate-to-tgw': t.union([NonEmptyString, t.boolean]),
  account: optional(t.string),
  'associate-type': optional(t.literal('ATTACH')),
  'tgw-rt-associate': optional(t.array(NonEmptyString)),
  'tgw-rt-propagate': optional(t.array(NonEmptyString)),
  'blackhole-route': optional(t.boolean),
  'attach-subnets': optional(t.array(NonEmptyString)),
  options: optional(t.array(TransitGatewayAttachOption)),
});

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

export const VpcConfigType = t.interface({
  deploy: optional(NonEmptyString),
  name: NonEmptyString,
  region,
  cidr,
  cidr2: optional(cidr),
  'flow-logs': fromNullable(t.boolean, false),
  'log-retention': optional(t.number),
  igw: t.union([t.boolean, t.undefined]),
  vgw: t.union([VirtualPrivateGatewayConfig, t.boolean, t.undefined]),
  pcx: t.union([PeeringConnectionConfig, t.boolean, t.undefined]),
  natgw: t.union([NatGatewayConfig, t.boolean, t.undefined]),
  subnets: optional(t.array(SubnetConfig)),
  'gateway-endpoints': optional(t.array(GatewayEndpointType)),
  'route-tables': optional(t.array(RouteTableConfig)),
  'tgw-attach': optional(TransitGatewayAttachConfig),
  'interface-endpoints': t.union([InterfaceEndpointConfig, t.boolean, t.undefined]),
  resolvers: optional(ResolversConfigType),
  'on-premise-rules': optional(t.array(OnPremZoneConfigType)),
});

export type VpcConfig = t.TypeOf<typeof VpcConfigType>;

export const DeploymentConfigType = t.interface({
  name: optional(NonEmptyString),
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
  'route-tables': optional(t.array(NonEmptyString)),
});

export const PasswordPolicyType = t.interface({
  history: t.number,
  'max-age': t.number,
  'min-age': t.number,
  'min-len': t.number,
  complexity: t.boolean,
  reversible: t.boolean,
});

export type DeploymentConfig = t.TypeOf<typeof DeploymentConfigType>;

export const ADUserConfig = t.interface({
  user: NonEmptyString,
  groups: t.array(t.string),
});

export const MadConfigType = t.interface({
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
  'share-to-master': t.boolean,
  restrict_srcips: t.array(cidr),
  'password-policies': PasswordPolicyType,
  'ad-groups': t.array(t.string),
  'adc-group': t.string,
  'ad-users': t.array(ADUserConfig),
});

export const AccountConfigType = t.interface({
  // 'password-policies': PasswordPolicyType,
  'ad-groups': t.array(t.string),
  'adc-group': t.string,
  'ad-users': t.array(ADUserConfig),
});

export const LANDING_ZONE_ACCOUNT_TYPES = ['primary', 'security', 'log-archive', 'shared-services'] as const;

export const LandingZoneAccountConfigType = enumType<typeof LANDING_ZONE_ACCOUNT_TYPES[number]>(
  LANDING_ZONE_ACCOUNT_TYPES,
);

export type LandingZoneAccountType = t.TypeOf<typeof LandingZoneAccountConfigType>;

export const MandatoryAccountConfigType = t.interface({
  'landing-zone-account-type': optional(LandingZoneAccountConfigType),
  'account-name': NonEmptyString,
  email: NonEmptyString,
  ou: NonEmptyString,
  'enable-s3-public-access': fromNullable(t.boolean, false),
  vpc: optional(VpcConfigType),
  deployments: optional(
    t.interface({
      tgw: optional(DeploymentConfigType),
      mad: optional(MadConfigType),
    }),
  ),
});

export type AccountConfig = t.TypeOf<typeof MandatoryAccountConfigType>;

export const MandatoryAccountsConfigType = t.record(t.string, MandatoryAccountConfigType);

export type MandatoryAccountConfig = t.TypeOf<typeof MandatoryAccountsConfigType>;

export const OrganizationalUnitConfigType = t.interface({
  vpc: optional(VpcConfigType),
});

export type OrganizationalUnitConfig = t.TypeOf<typeof OrganizationalUnitConfigType>;

export const OrganizationalUnitsConfigType = t.record(t.string, OrganizationalUnitConfigType);

export type OrganizationalUnitsConfig = t.TypeOf<typeof OrganizationalUnitsConfigType>;

export const ZoneNamesConfigType = t.interface({
  public: t.array(t.string),
  private: t.array(t.string),
});

export const GlobalOptionsZonesConfigType = t.interface({
  account: NonEmptyString,
  'resolver-vpc': NonEmptyString,
  names: ZoneNamesConfigType,
});

export type GlobalOptionsZonesConfig = t.TypeOf<typeof GlobalOptionsZonesConfigType>;

export const GlobalOptionsConfigType = t.interface({
  'central-log-retention': t.number,
  zones: GlobalOptionsZonesConfigType,
});

export type GlobalOptionsConfig = t.TypeOf<typeof GlobalOptionsConfigType>;

export const AcceleratorConfigType = t.interface({
  'global-options': GlobalOptionsConfigType,
  'mandatory-account-configs': MandatoryAccountsConfigType,
  'organizational-units': t.record(t.string, OrganizationalUnitConfigType),
});

export type AcceleratorConfig = t.TypeOf<typeof AcceleratorConfigType>;
export type OrganizationalUnit = t.TypeOf<typeof OrganizationalUnitConfigType>;
export type MadDeploymentConfig = t.TypeOf<typeof MadConfigType>;

export namespace AcceleratorConfig {
  export function fromBuffer(content: Buffer): AcceleratorConfig {
    return fromString(content.toString());
  }

  export function fromString(content: string): AcceleratorConfig {
    return fromObject(JSON.parse(content));
  }

  export function fromObject<S>(content: S): AcceleratorConfig {
    return parse(AcceleratorConfigType, content);
  }
}

export function parse<S, T>(type: t.Decoder<S, T>, content: S): T {
  const result = type.decode(content);
  if (isLeft(result)) {
    const errors = PathReporter.report(result).map(error => `* ${error}`);
    const errorMessage = errors.join('\n');
    throw new Error(`Could not parse content:\n${errorMessage}`);
  }
  return result.right;
}
