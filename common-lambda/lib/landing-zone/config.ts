import * as t from 'io-ts';
import { fromNullable } from 'io-ts-types/lib/fromNullable';
import * as yaml from 'js-yaml';
import { parse } from '../config';
import { optional } from '../config/types';

export const AccountConfigType = t.interface({
  name: t.string,
  email: optional(t.string),
  ssm_parameters: t.array(
    t.interface({
      name: t.string,
      value: t.string,
    }),
  ),
});

export const OrganizationalUnitConfigType = t.interface({
  name: t.string,
  core_accounts: fromNullable(t.array(AccountConfigType), []),
});

export type OrganizationalUnitConfig = t.TypeOf<typeof OrganizationalUnitConfigType>;

export const LandingZoneConfigType = t.interface({
  region: t.string,
  version: t.any,
  nested_ou_delimiter: t.string,
  organizational_units: t.array(OrganizationalUnitConfigType),
});

export type LandingZoneConfig = t.TypeOf<typeof LandingZoneConfigType>;

export function fromYaml(content: string): LandingZoneConfig {
  return fromObject(yaml.load(content));
}

export function fromObject<S>(content: S): LandingZoneConfig {
  return parse(LandingZoneConfigType, content);
}
