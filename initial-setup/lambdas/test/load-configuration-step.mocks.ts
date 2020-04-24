import { LandingZoneConfig } from '@aws-pbmm/common-lambda/lib/landing-zone/config';
import * as org from 'aws-sdk/clients/organizations';
import * as smn from 'aws-sdk/clients/secretsmanager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';

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
  organizationalUnits: org.OrganizationalUnit[];
  organizationalUnitAccounts: { [ouId: string]: org.Account[] };
}

export const values: MockValues = {
  acceleratorConfig: {},
  landingZoneConfig: {},
  organizationalUnits: [],
  organizationalUnitAccounts: {},
};

jest.mock('@aws-pbmm/common-lambda/lib/landing-zone', () => ({
  LandingZone: class {
    async findLandingZoneStack(): Promise<unknown | null> {
      return {
        version: '2.3.0',
        config: values.landingZoneConfig,
      };
    }
  },
}));

jest.mock('@aws-pbmm/common-lambda/lib/config', () => ({
  LANDING_ZONE_ACCOUNT_TYPES: ['primary', 'security', 'log-archive', 'shared-services'],
  AcceleratorConfig: class {
    static fromString() {
      return values.acceleratorConfig;
    }
  },
}));

jest.mock('@aws-pbmm/common-lambda/lib/aws/organizations', () => ({
  Organizations: class {
    async listOrganizationalUnits(): Promise<org.OrganizationalUnit[]> {
      return values.organizationalUnits;
    }

    async listAccountsForParent(parentId: string): Promise<org.Account[]> {
      return values.organizationalUnitAccounts[parentId];
    }
  },
}));

jest.mock('@aws-pbmm/common-lambda/lib/aws/secrets-manager', () => ({
  SecretsManager: class {
    async getSecret(secretId: string): Promise<smn.GetSecretValueResponse> {
      return {
        // What we return here does not matter, it should just not be empty
        SecretString: '',
      };
    }
    async putSecretValue(input: smn.PutSecretValueRequest): Promise<smn.PutSecretValueResponse> {
      // What we return here does not matter, it should just not be empty
      return {};
    }
  },
}));
