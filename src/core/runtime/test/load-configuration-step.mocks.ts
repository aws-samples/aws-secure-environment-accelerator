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

import * as aws from 'aws-sdk';
import { Account, OrganizationalUnit } from 'aws-sdk/clients/organizations';
import { AcceleratorConfig } from '@aws-accelerator/common-config';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { ServiceCatalog } from '@aws-accelerator/common/src/aws/service-catalog';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';
import { STS } from '@aws-accelerator/common/src/aws/sts';
import * as path from 'path';
import * as fs from 'fs';
import { loadAcceleratorConfig } from '@aws-accelerator/common-config/src/load';
import { ProvisionedProductAttributes, SearchProvisionedProductsOutput } from 'aws-sdk/clients/servicecatalog';
jest.mock('@aws-accelerator/common-config/src/load');
aws.config.logger = console;

type DeepPartial<T> = {
  // eslint-disable-next-line @typescript-eslint/array-type
  [P in keyof T]?: T[P] extends Array<infer U> // eslint-disable-next-line @typescript-eslint/array-type
    ? Array<DeepPartial<U>> // eslint-disable-next-line @typescript-eslint/no-shadow
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
  provisionedProducts: ProvisionedProductAttributes[];
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

  jest.spyOn(ServiceCatalog.prototype, 'searchProvisionedProductsForAllAccounts').mockImplementation(async () => []);

  // Mock "loadAcceleratorConfig" directly with content from test/config.example.json
  const configFilePath = path.join(__dirname, '..', '..', '..', '..', 'test', 'config.example.json');
  const content = fs.readFileSync(configFilePath);
  values.acceleratorConfig = AcceleratorConfig.fromString(content.toString());
  const loadAcceleratorConfigMock = loadAcceleratorConfig as jest.Mock;
  loadAcceleratorConfigMock.mockReturnValue(values.acceleratorConfig);
}
