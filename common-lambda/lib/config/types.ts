import * as t from 'io-ts';
import { either } from 'fp-ts/lib/Either';
import { IPv4CidrRange } from 'ip-num/IPv4CidrRange';

export const optional = <T extends t.Mixed>(wrapped: T) => t.union([wrapped, t.undefined]);

export const cidr = new t.Type<IPv4CidrRange, string, unknown>(
  'Cidr',
  (value): value is IPv4CidrRange => value instanceof IPv4CidrRange,
  (str, context) =>
    either.chain(t.string.validate(str, context), (s: string) => {
      try {
        return t.success(IPv4CidrRange.fromCidr(s));
      } catch (e) {
        return t.failure(s, context, e);
      }
    }),
  c => c.toCidrString(),
);

export class EnumType<T> extends t.Type<T> {
  readonly _tag: 'EnumType' = 'EnumType';
  readonly values: readonly T[];

  constructor(values: ReadonlyArray<T>, name?: string) {
    super(
      name || 'enum',
      (u): u is T => values.some(v => v === u),
      (u, c) => (this.is(u) ? t.success(u) : t.failure(u, c)),
      t.identity,
    );
    this.values = values;
  }
}

export const enumType = <T>(e: ReadonlyArray<T>, name?: string) => new EnumType<T>(e, name);

// TODO Hardcoded for now. Should be replaced with a library or a call to `DescribeRegions`
const regions = [
  'ap-east-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ca-central-1',
  'eu-central-1',
  'eu-north-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'me-south-1',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
] as const;

const availabilityZones = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

export const region = enumType<typeof regions[number]>(regions, 'Region');

export type Region = t.TypeOf<typeof region>;

export const availabilityZone = enumType<typeof availabilityZones[number]>(availabilityZones, 'AvailabilityZone');

export type AvailabilityZone = t.TypeOf<typeof availabilityZone>;
