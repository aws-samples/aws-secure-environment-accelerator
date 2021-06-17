import * as aws from 'aws-sdk';
import { Account, OrganizationalUnit } from 'aws-sdk/clients/organizations';
import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import * as path from 'path';
import * as fs from 'fs';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
jest.mock('@aws-accelerator/common-config/src/load');
aws.config.logger = console;

type DeepPartial<T> = {
  // eslint-disable-next-line @typescript-eslint/array-type
  [P in keyof T]?: T[P] extends Array<infer U> // eslint-disable-next-line @typescript-eslint/array-type
    ? Array<DeepPartial<U>> //eslint-disable-next-line @typescript-eslint/no-shadow
    : T[P] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : DeepPartial<T[P]>;
};

interface MockValues {
  acceleratorConfig: DeepPartial<AcceleratorConfig>;
  organizationalUnits: OrganizationalUnit[];
  organizationalUnitAccounts: { [ouId: string]: Account[] };
  accounts: Account[];
  masterAccount: Account;
}

export const values: MockValues = {
  acceleratorConfig: {},
  organizationalUnits: [],
  organizationalUnitAccounts: {},
  accounts: [],
  masterAccount: {},
};

export function install() {
  // @ts-ignore
  jest
    .spyOn(Organizations.prototype, 'getOrganizationalUnit')
    .mockImplementation(async (ouId: string) => values.organizationalUnits.find(ou => ou.Id === ouId));

  jest.spyOn(Organizations.prototype, 'listParents').mockImplementation(async (accountId: string) => []);

  jest
    .spyOn(Organizations.prototype, 'listOrganizationalUnits')
    .mockImplementation(async () => values.organizationalUnits);

  jest
    .spyOn(Organizations.prototype, 'listAccountsForParent')
    .mockImplementation(async (parentId: string) => values.organizationalUnitAccounts[parentId]);

  jest.spyOn(Organizations.prototype, 'listAccounts').mockImplementation(async () => values.accounts);

  jest.spyOn(STS.prototype, 'getCallerIdentity').mockImplementation(async () => ({
    Account: '111111111111',
  }));

  jest
    .spyOn(Organizations.prototype, 'getAccount')
    .mockImplementation(async (accountId: string) => values.masterAccount);

  jest.spyOn(Organizations.prototype, 'listPoliciesForTarget').mockImplementation(async () => []);

  jest
    .spyOn(DynamoDB.prototype, 'getItem')
    .mockImplementation(async (tableName: string, client: DynamoDB) => Promise.resolve([]));

  // Mock "loadAcceleratorConfig" directly with content from test/config.example.json
  const configFilePath = path.join(__dirname, '..', '..', '..', '..', 'test', 'config.example.json');
  const content = fs.readFileSync(configFilePath);
  values.acceleratorConfig = AcceleratorConfig.fromString(content.toString());
  const loadAcceleratorConfigMock = loadAcceleratorConfig as jest.Mock;
  loadAcceleratorConfigMock.mockReturnValue(values.acceleratorConfig);
}
