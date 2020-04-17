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
  subnets: NonEmptyString,
  // TODO
});

export const NatGatewayConfig = t.interface({
  subnet: NonEmptyString,
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
  definitions: t.array(SubnetDefinitionConfig),
});

export const gatewayEndpointTypes = ['s3', 'dynamodb'];

export const GatewayEndpointType = enumType<typeof gatewayEndpointTypes[number]>(gatewayEndpointTypes);

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

export const VpcConfigType = t.interface({
  deploy: optional(NonEmptyString),
  name: NonEmptyString,
  cidr: optional(cidr),
  cidr2: optional(cidr),
  region: optional(region),
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

export const AccountConfigType = t.interface({
  'account-name': NonEmptyString,
  email: NonEmptyString,
  ou: NonEmptyString,
  vpc: optional(VpcConfigType),
  deployments: t.interface({
    tgw: optional(DeploymentConfigType),
  }),
});

export const OrganizationalUnitConfigType = t.interface({
  vpc: VpcConfigType,
});

export const OrganizationalUnitsType = t.interface({
  central: OrganizationalUnitConfigType,
});

export const MandatoryAccountConfigType = t.interface({
  operations: AccountConfigType,
  'shared-network': AccountConfigType,
  master: AccountConfigType,
  perimeter: AccountConfigType,
});

export const PasswordConfigType = t.interface({
  'secret-name': t.string,
  length: t.number,
});

export type PasswordConfig = t.TypeOf<typeof PasswordConfigType>;

export const PasswordsConfigType = t.record(t.string, PasswordConfigType);

export type PasswordsConfig = t.TypeOf<typeof PasswordsConfigType>;

export const GlobalOptionsAccountsConfigType = t.interface({
  'lz-primary-account': t.string,
  'lz-security-account': t.string,
  'lz-log-archive-account': t.string,
  'lz-shared-services-account': t.string,
  mandatory: t.array(t.string),
});

export type GlobalOptionsAccountsConfig = t.TypeOf<typeof GlobalOptionsAccountsConfigType>;

export const ZoneNamesConfigType = t.interface({
  public: t.array(t.string),
  private: t.array(t.string),
});

export const GlobalOptionsZonesConfigType = t.interface({
  account: NonEmptyString,
  'resolver-vpc': NonEmptyString,
  'resolver-subnet': NonEmptyString,
  names: ZoneNamesConfigType,
});

export type GlobalOptionsZonesConfig = t.TypeOf<typeof GlobalOptionsZonesConfigType>;

export const GlobalOptionsConfigType = t.interface({
  accounts: GlobalOptionsAccountsConfigType,
  zones: GlobalOptionsZonesConfigType,
  passwords: fromNullable(PasswordsConfigType, {}),
});

export const AcceleratorConfigType = t.interface({
  'global-options': GlobalOptionsConfigType,
  'mandatory-account-configs': t.record(t.string, AccountConfigType),
  'organizational-units': OrganizationalUnitsType,
});

export type AcceleratorConfig = t.TypeOf<typeof AcceleratorConfigType>;
export type AccountConfig = t.TypeOf<typeof AccountConfigType>;
export type DeploymentConfig = t.TypeOf<typeof DeploymentConfigType>;
export type OrganizationalUnits = t.TypeOf<typeof OrganizationalUnitsType>;

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
