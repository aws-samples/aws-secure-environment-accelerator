import { Account, OrganizationalUnit } from 'aws-sdk/clients/organizations';
import { LandingZoneConfig } from '@aws-pbmm/common-lambda/lib/landing-zone/config';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { LandingZone } from '@aws-pbmm/common-lambda/lib/landing-zone';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';

type DeepPartial<T> = {
  // tslint:disable-next-line: array-type
  [P in keyof T]?: T[P] extends Array<infer U> // tslint:disable-next-line: array-type
    ? Array<DeepPartial<U>> // tslint:disable-next-line: no-shadowed-variable
    : T[P] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : DeepPartial<T[P]>;
};

interface MockValues {
  acceleratorConfig: DeepPartial<AcceleratorConfig>;
  landingZoneConfig: DeepPartial<LandingZoneConfig>;
  organizationalUnits: OrganizationalUnit[];
  organizationalUnitAccounts: { [ouId: string]: Account[] };
}

export const values: MockValues = {
  acceleratorConfig: {},
  landingZoneConfig: {},
  organizationalUnits: [],
  organizationalUnitAccounts: {},
};

export function install() {
  jest.spyOn(LandingZone.prototype, 'findLandingZoneStack').mockImplementation(async () => ({
    version: '2.3.0',
    config: values.landingZoneConfig,
  }));

  jest
    .spyOn(AcceleratorConfig, 'fromString')
    .mockImplementation(() => new AcceleratorConfig(values.acceleratorConfig as AcceleratorConfig));

  jest.spyOn(Organizations.prototype, 'listOrganizationalUnits').mockImplementation(() => values.organizationalUnits);

  jest
    .spyOn(Organizations.prototype, 'listAccountsForParent')
    .mockImplementation((parentId: string) => values.organizationalUnitAccounts[parentId]);

  // What we return here does not matter, it should just not be undefined
  jest.spyOn(SecretsManager.prototype, 'getSecret').mockImplementation(() => ({
    SecretString: '',
  }));

  // What we return here does not matter, it should just not be undefined
  jest.spyOn(SecretsManager.prototype, 'putSecretValue').mockImplementation(() => ({}));
}
