import * as t from 'io-ts';
import { either } from 'fp-ts/lib/Either';
import { IPv4CidrRange } from 'ip-num/IPv4CidrRange';

export const optional = <T extends t.Mixed>(wrapped: T) => t.union([wrapped, t.undefined]);

export const cidr = new t.Type<IPv4CidrRange, string, unknown>(
  'Cidr',
  (value): value is IPv4CidrRange => value instanceof IPv4CidrRange,
  (string, context) =>
    either.chain(t.string.validate(string, context), (s) => {
      try {
        const cidr = IPv4CidrRange.fromCidr(s);
        return t.success(cidr);
      } catch (e) {
        return t.failure(string, context, e);
      }
    }),
  (cidr) => cidr.toString(),
);

export class EnumType<T> extends t.Type<T> {
  public readonly _tag: 'EnumType' = 'EnumType';

  public constructor(values: ReadonlyArray<T>, name?: string) {
    super(
      name || 'enum',
      (u): u is T => values.some((v) => v === u),
      (u, c) => (this.is(u) ? t.success(u) : t.failure(u, c)),
      t.identity,
    );
  }
}

export const createEnumType = <T>(e: ReadonlyArray<T>, name?: string) => new EnumType<T>(e, name);
