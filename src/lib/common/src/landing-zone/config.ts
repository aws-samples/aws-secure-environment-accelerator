import * as t from 'io-ts';
import * as yaml from 'js-yaml';
import { defaulted, optional, parse } from '@aws-accelerator/common-types';

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
  core_accounts: defaulted(t.array(AccountConfigType), []),
});

export const ProductType = t.interface({
  name: t.string,
});

export const PortfolioType = t.interface({
  name: t.string,
  description: t.string,
  owner: t.string,
  principal_role: t.string,
  products: t.array(ProductType),
});

export type OrganizationalUnitConfig = t.TypeOf<typeof OrganizationalUnitConfigType>;

export const LandingZoneConfigType = t.interface({
  region: t.string,
  version: t.unknown,
  nested_ou_delimiter: t.string,
  organizational_units: t.array(OrganizationalUnitConfigType),
  portfolios: t.array(PortfolioType),
});

export type LandingZoneConfig = t.TypeOf<typeof LandingZoneConfigType>;

export function fromYaml(content: string): LandingZoneConfig {
  return fromObject(yaml.load(content));
}

export function fromObject<S>(content: S): LandingZoneConfig {
  return parse(LandingZoneConfigType, content);
}
