import * as t from 'io-ts';
import { cidr, createEnumType, optional } from './types';
import { PathReporter } from './reporter';
import { NonEmptyString } from 'io-ts-types/lib/NonEmptyString';
import { fromNullable } from 'io-ts-types/lib/fromNullable';
import { isLeft } from 'fp-ts/lib/Either';

export const InternetGatewayConfig = t.interface({
  // TODO
});

export const VirtualPrivateGatewayConfig = t.interface({
  // TODO
});

export const PeeringConnectionConfig = t.interface({
  source: NonEmptyString,
  subnets: NonEmptyString,
  // TODO
});

export const NatGatewayConfig = t.interface({
  // TODO
});

export const SubnetAzConfig = t.interface({
  'route-table': NonEmptyString,
  cidr: cidr,
});

export const SubnetConfig = t.interface({
  name: NonEmptyString,
  'share-to-ou-accounts': fromNullable(t.boolean, false),
  az1: optional(SubnetAzConfig),
  az2: optional(SubnetAzConfig),
  az3: optional(SubnetAzConfig),
});

export const Region = createEnumType(
  [
    // TODO Add more regions here
    'ca-central-1',
    'us-east-1',
  ],
  'Region',
);

export const AvailabilityZone = createEnumType(['a', 'b', 'c', 'd', 'e', 'f'], 'AvailabilityZone');

export const VpcAzConfig = t.interface({
  // TODO We might need to rework this part
  az1: optional(AvailabilityZone),
  az2: optional(AvailabilityZone),
  az3: optional(AvailabilityZone),
});

export const GatewayEndpointType = NonEmptyString; // TODO Define all endpoints here

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

export const InterfaceEndpointName = NonEmptyString; // TODO Define all endpoints here

export const InterfaceEndpointConfig = t.interface({
  subnet: NonEmptyString,
  endpoints: t.array(InterfaceEndpointName),
});

export const VpcConfigType = t.interface({
  deploy: optional(NonEmptyString),
  name: NonEmptyString,
  cidr: optional(cidr),
  region: optional(Region),
  'flow-logs': fromNullable(t.boolean, false),
  'log-retention': optional(t.number),
  igw: t.union([InternetGatewayConfig, t.boolean, t.undefined]),
  vgw: t.union([VirtualPrivateGatewayConfig, t.boolean, t.undefined]),
  pcx: t.union([PeeringConnectionConfig, t.boolean, t.undefined]),
  natgw: t.union([NatGatewayConfig, t.boolean, t.undefined]),
  azs: optional(VpcAzConfig),
  subnets: optional(t.array(t.union([SubnetConfig, t.string]))),
  'gateway-endpoints': optional(t.array(GatewayEndpointType)),
  'route-tables': optional(t.array(RouteTableConfig)),
  'tgw-attach': optional(TransitGatewayAttachConfig),
  'interface-endpoints': t.union([InterfaceEndpointConfig, t.boolean, t.undefined]),
});

export const DeploymentFeature = NonEmptyString;

export const DeploymentConfig = t.interface({
  name: optional(NonEmptyString),
  asn: optional(t.number),
  features: optional(t.record(DeploymentFeature, t.boolean)),
  'route-tables': optional(t.array(NonEmptyString)),
});

export const AccountConfigType = t.interface({
  'account-name': NonEmptyString,
  email: NonEmptyString,
  ou: NonEmptyString,
  vpc: VpcConfigType,
  deployments: t.record(NonEmptyString, DeploymentConfig),
});

export const MandatoryAccountConfigType = t.interface({
  operations: AccountConfigType,
  'shared-network': AccountConfigType,
  master: AccountConfigType,
});

export const AcceleratorConfigType = t.interface({
  'mandatory-account-configs': MandatoryAccountConfigType,
});

export type AcceleratorConfig = t.TypeOf<typeof AcceleratorConfigType>;

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
