import * as aws from 'aws-sdk';
import { Account, OrganizationalUnit } from 'aws-sdk/clients/organizations';
import { LandingZoneConfig } from '@aws-accelerator/common/src/landing-zone/config';
import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { SSM } from '@aws-accelerator/common/src/aws/ssm';
import { LandingZone } from '@aws-accelerator/common/src/landing-zone';
import { CodeCommit } from '@aws-accelerator/common/src/aws/codecommit';

aws.config.logger = console;

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
  // @ts-ignore
  jest.spyOn(LandingZone.prototype, 'findLandingZoneStack').mockImplementation(async () => ({
    version: '2.3.0',
    config: values.landingZoneConfig,
  }));

  jest
    .spyOn(AcceleratorConfig, 'fromString')
    .mockImplementation(() => new AcceleratorConfig(values.acceleratorConfig as AcceleratorConfig));

  jest
    .spyOn(Organizations.prototype, 'getOrganizationalUnit')
    .mockImplementation(async (ouId: string) => values.organizationalUnits.find(ou => ou.Id === ouId));

  jest.spyOn(Organizations.prototype, 'listParents').mockImplementation(async (accountId: string) => []);

  jest
    .spyOn(Organizations.prototype, 'listOrganizationalUnits')
    .mockImplementation(async () => values.organizationalUnits);

  jest.spyOn(SSM.prototype, 'getParameter').mockImplementation(async () => ({
    Parameter: {
      Value: 'lz@amazon.com',
    },
  }));

  jest
    .spyOn(Organizations.prototype, 'listAccountsForParent')
    .mockImplementation(async (parentId: string) => values.organizationalUnitAccounts[parentId]);

  // What we return here does not matter, it should just not be undefined

  jest.spyOn(CodeCommit.prototype, 'getFile').mockImplementation(async () => ({
    blobId: '',
    commitId: '',
    fileContent: '',
    fileMode: '',
    filePath: '',
    fileSize: 0,
  }));
}
