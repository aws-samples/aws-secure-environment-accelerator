import * as t from 'io-ts';
import { cidr, region, availabilityZone, optional } from './types';
import { PathReporter } from './reporter';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';
import { fromNullable } from 'io-ts-types/lib/fromNullable';
import { isLeft } from 'fp-ts/lib/Either';

const VirtualPrivateGatewayConfig = t.interface({
  // TODO
});

const PeeringConnectionConfig = t.interface({
  source: NonEmptyString,
  subnets: NonEmptyString,
  // TODO
});

const NatGatewayConfig = t.interface({
  // TODO
});

const SubnetDefinitionConfig = t.interface({
  az: availabilityZone,
  cidr: cidr,
  'route-table': NonEmptyString,
  disabled: fromNullable(t.boolean, false),
});

const SubnetConfig = t.interface({
  name: NonEmptyString,
  'share-to-ou-accounts': fromNullable(t.boolean, false),
  'definitions': t.array(SubnetDefinitionConfig),
});

const GatewayEndpointType = NonEmptyString; // TODO Define all endpoints here

const RouteConfig = t.interface({
  destination: t.unknown, // TODO Can be string or destination in another account
  target: NonEmptyString,
});

const RouteTableConfig = t.interface({
  name: NonEmptyString,
  routes: optional(t.array(RouteConfig)),
});

const TransitGatewayAttachOption = NonEmptyString; // TODO Define all attach options here

const TransitGatewayAttachConfig = t.interface({
  'associate-to-tgw': t.union([NonEmptyString, t.boolean]),
  account: optional(t.string),
  'associate-type': optional(t.literal('ATTACH')),
  'tgw-rt-associate': optional(t.array(NonEmptyString)),
  'tgw-rt-propagate': optional(t.array(NonEmptyString)),
  'blackhole-route': optional(t.boolean),
  'attach-subnets': optional(t.array(NonEmptyString)),
  options: optional(t.array(TransitGatewayAttachOption)),
});

const InterfaceEndpointName = NonEmptyString; // TODO Define all endpoints here

const InterfaceEndpointConfig = t.interface({
  subnet: NonEmptyString,
  endpoints: t.array(InterfaceEndpointName),
});

const VpcConfigType = t.interface({
  deploy: optional(NonEmptyString),
  name: NonEmptyString,
  cidr: optional(cidr),
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
});

export type VpcConfig = t.TypeOf<typeof VpcConfigType>;

const DeploymentFeature = NonEmptyString;

export const DeploymentConfigType = t.interface({
  name: optional(NonEmptyString),
  asn: optional(t.number),
  features: optional(t.record(DeploymentFeature, t.boolean)),
  'route-tables': optional(t.array(NonEmptyString)),
});

const AccountConfigType = t.interface({
  'account-name': NonEmptyString,
  email: NonEmptyString,
  ou: NonEmptyString,
  vpc: VpcConfigType,
  deployments: t.record(NonEmptyString, DeploymentConfigType),
});

const MandatoryAccountConfigType = t.interface({
  operations: AccountConfigType,
  'shared-network': AccountConfigType,
  master: AccountConfigType,
});

const AcceleratorConfigType = t.interface({
  'mandatory-account-configs': MandatoryAccountConfigType,
});

export type AcceleratorConfig = t.TypeOf<typeof AcceleratorConfigType>;
export type AccountConfig = t.TypeOf<typeof AccountConfigType>;
export type DeploymentConfig = t.TypeOf<typeof DeploymentConfigType>;

export namespace AcceleratorConfig {
  export function fromString(content: string): AcceleratorConfig {
    return fromObject(JSON.parse(content));
  }

  export function fromObject(content: any): AcceleratorConfig {
    return parse(AcceleratorConfigType, content);
  }
}

export function parse<T>(type: t.Decoder<any, T>, content: any): T {
  const result = type.decode(content);
  if (isLeft(result)) {
    const errors = PathReporter.report(result).map((error) => `* ${error}`);
    const errorMessage = errors.join('\n');
    throw new Error(`Could not parse content:\n${errorMessage}`);
  }
  return result.right;
}
