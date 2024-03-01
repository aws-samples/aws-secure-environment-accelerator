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

/* eslint-disable deprecation/deprecation */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as t from 'io-ts';
import { either } from 'fp-ts/lib/Either';
import { IPv4CidrRange } from 'ip-num';

export type { Any, AnyProps, Mixed, Props, TypeC, TypeOf } from 'io-ts';
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
  bigint,
  BigIntType,
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
            return t.failure(s, context, `Value ${s} should be a CIDR range.`);
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

export type WithSize = number | string | any[] | Map<any, any> | Set<any>;

function getSize(sized: WithSize): number {
  if (typeof sized === 'number') {
    return sized;
  } else if (typeof sized === 'string') {
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

export interface SizedTypeProps {
  readonly min?: number;
  readonly max?: number;
  readonly name?: string;
  readonly errorMessage?: string;
}

export class SizedType<A extends WithSize, T extends t.Type<A>> extends t.Type<T['_A'], T['_O'], T['_I']> {
  readonly min?: number | undefined;
  readonly max?: number | undefined;

  constructor(readonly type: T, readonly props: SizedTypeProps = {}) {
    super(
      props.name ?? `Sized<${type.name}>`,
      type.is,
      (u, c) =>
        either.chain(type.validate(u, c), (s: A) => {
          const size = getSize(s);
          const minValid = !props.min || (props.min && size >= props.min);
          const maxValid = !props.max || (props.max && size <= props.max);
          if (minValid && maxValid) {
            return t.success(s);
          } else {
            const errorMessage =
              props.errorMessage ?? `${'Value'} should be of size [${props.min ?? '-∞'}, ${props.max ?? '∞'}]`;
            return t.failure(s, c, errorMessage);
          }
        }),
      type.encode,
    );
    this.min = props.min;
    this.max = props.max;
  }
}
export interface EnumTypeProps {
  readonly name: string;
  readonly errorMessage?: string;
}

export class EnumType<T extends string | number> extends t.Type<T> {
  readonly _tag: 'EnumType' = 'EnumType';

  constructor(readonly values: ReadonlyArray<T>, props: EnumTypeProps) {
    super(
      props.name,
      (u): u is T => values.some(v => v === u),
      (u, c) =>
        this.is(u)
          ? t.success(u)
          : t.failure(u, c, props.errorMessage ?? `Value should be one of "${values.join('", "')}"`),
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
  props: SizedTypeProps = {},
): SizedType<A, T> {
  return new SizedType<A, T>(type, props);
}

/**
 * Create an enumeration type.
 */
export function enums<T extends string | number>(
  name: string,
  values: ReadonlyArray<T>,
  errorMessage?: string,
): EnumType<T> {
  return new EnumType<T>(values, { name, errorMessage });
}

export function optional<T extends t.Any>(wrapped: T, name?: string): OptionalType<T> {
  return new OptionalType(wrapped, name);
}

export const nonEmptyString = sized<string>(t.string, {
  min: 1,
  errorMessage: 'Value can not be empty.',
});

export const cidr = new CidrType();
export type Cidr = t.TypeOf<typeof cidr>;

export const region = enums(
  'Region',
  [
    'af-south-1',
    'ap-east-1',
    'ap-northeast-1',
    'ap-northeast-2',
    'ap-northeast-3',
    'ap-south-1',
    'ap-southeast-1',
    'ap-southeast-2',
    'ca-central-1',
    'ca-west-1',
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
  ],
  'Value should be an AWS region.',
);
export type Region = t.TypeOf<typeof region>;

export const availabilityZone = enums('AvailabilityZone', ['a', 'b', 'c', 'd', 'e', 'f']);
export type AvailabilityZone = t.TypeOf<typeof availabilityZone>;
