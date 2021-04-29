import * as t from 'io-ts';
import { either } from 'fp-ts/lib/Either';
import { IPv4CidrRange } from 'ip-num';

export type { Any, AnyProps, Props, TypeOf } from 'io-ts';
export {
  array,
  Array,
  ArrayType,
  boolean,
  BooleanType,
  dictionary,
  DictionaryType,
  interface,
  InterfaceType,
  intersection,
  IntersectionType,
  literal,
  LiteralType,
  number,
  NumberType,
  partial,
  PartialType,
  record,
  string,
  StringType,
  type,
  Type,
  undefined,
  UndefinedType,
  union,
  UnionType,
  unknown,
  UnknownType,
} from 'io-ts';

export class CidrType extends t.Type<IPv4CidrRange, string, unknown> {
  constructor(name?: string) {
    super(
      name ?? 'Cidr',
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
  }
}

export class DefaultedType<T extends t.Any> extends t.Type<T['_A'], T['_O'], T['_I']> {
  constructor(readonly type: T, readonly defaultValue: T['_A'], name?: string) {
    super(
      name ?? `Default<${type.name}>`,
      type.is,
      (u, c) => (u == null ? t.success(defaultValue) : type.validate(u, c)),
      type.encode,
    );
  }
}

export class OptionalType<T extends t.Any> extends t.Type<
  T['_A'] | undefined,
  T['_O'] | undefined,
  T['_I'] | undefined
> {
  constructor(readonly type: T, name?: string) {
    super(
      name ?? `Optional<${type.name}>`,
      (u): u is T['_A'] | undefined => (u == null ? true : type.is(u)),
      (u, c) => (u == null ? t.success(undefined) : type.validate(u, c)),
      type.encode,
    );
  }
}

export type WithSize = string | any[] | Map<any, any> | Set<any>;

function getSize(sized: WithSize): number {
  if (typeof sized === 'string') {
    return sized.length;
  } else if (Array.isArray(sized)) {
    return sized.length;
  } else if (sized instanceof Set) {
    return sized.size;
  } else if (sized instanceof Map) {
    return sized.size;
  }
  throw new Error(`Unsupported size value ${sized}`);
}

// TODO Use props
export interface SizedTypeProps {
  readonly min?: number;
  readonly max?: number;
  readonly name?: string;
}

export class SizedType<A extends WithSize, T extends t.Type<A>> extends t.Type<T['_A'], T['_O'], T['_I']> {
  constructor(readonly type: T, readonly min?: number, readonly max?: number, name?: string) {
    super(
      name ?? `Sized<${type.name}>`,
      type.is,
      (u, c) =>
        either.chain(type.validate(u, c), (s: A) => {
          const size = getSize(s);
          const minValid = !min || (min && size >= min);
          const maxValid = !max || (max && size <= max);
          if (minValid && maxValid) {
            return t.success(s);
          } else {
            return t.failure(s, c, `${'Value'} should be of size [${min ?? '-∞'}, ${max ?? '∞'}]`);
          }
        }),
      type.encode,
    );
  }
}

export class EnumType<T extends string | number> extends t.Type<T> {
  readonly _tag: 'EnumType' = 'EnumType';

  constructor(readonly values: ReadonlyArray<T>, name: string) {
    super(
      name,
      (u): u is T => values.some(v => v === u),
      (u, c) => (this.is(u) ? t.success(u) : t.failure(u, c)),
      t.identity,
    );
  }
}

export type Definition<P extends t.Props> = t.TypeC<P> & { definitionName: string };

export function definition<P extends t.Props>(name: string, props: P): Definition<P> {
  return Object.assign(t.type(props, name), { definitionName: name });
}

export function isDefinition<P extends t.Props>(type: t.TypeC<P>): type is Definition<P> {
  return 'definitionName' in type;
}

export function defaulted<T extends t.Any>(type: T, defaultValue: T['_A'], name?: string): DefaultedType<T> {
  return new DefaultedType<T>(type, defaultValue, name);
}

export function sized<A extends WithSize, T extends t.Type<A> = t.Type<A>>(
  type: T,
  min?: number,
  max?: number,
  name?: string,
): SizedType<A, T> {
  return new SizedType<A, T>(type, min, max, name);
}

/**
 * Create an enumeration type.
 */
export function enums<T extends string | number>(name: string, values: ReadonlyArray<T>): EnumType<T> {
  return new EnumType<T>(values, name);
}

export function optional<T extends t.Any>(wrapped: T, name?: string): OptionalType<T> {
  return new OptionalType(wrapped, name);
}

export const nonEmptyString = sized<string>(t.string, 1);

export const cidr = new CidrType();
export type Cidr = t.TypeOf<typeof cidr>;

export const region = enums('Region', [
  'af-south-1',
  'ap-east-1',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ca-central-1',
  'cn-north-1',
  'cn-northwest-1',
  'eu-central-1',
  'eu-north-1',
  'eu-south-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'me-south-1',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-gov-east-1',
  'us-gov-west-1',
  'us-west-1',
  'us-west-2',
]);
export type Region = t.TypeOf<typeof region>;

export const availabilityZone = enums('AvailabilityZone', ['a', 'b', 'c', 'd', 'e', 'f']);
export type AvailabilityZone = t.TypeOf<typeof availabilityZone>;
