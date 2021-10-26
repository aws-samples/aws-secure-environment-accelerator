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
