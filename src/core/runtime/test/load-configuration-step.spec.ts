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

import * as mocks from './load-configuration-step.mocks'; // IMPORTANT! Load the mocks _before_ the module under test!
import { handler } from '../src/configuration/load-organizations-config';

beforeAll(() => {
  mocks.install();
});

beforeEach(() => {
  // Reset the mocks before every test
  reset();
});

test('the handler should be successfully return when the configuration is correct', async () => {
  const result = await handler({
    configFilePath: 'config.json',
    configRepositoryName: 'PBMMAccel-Repo-Config',
    configCommitId: 'latestCommitId',
    organizationAdminRole: '',
    acceleratorPrefix: 'PBMMAccel-',
    parametersTableName: 'PBMMAccel-Parameters',
  });
  expect(result);
});

test('the handler should be successfully return when a mandatory account is missing', async () => {
  // Remove operations account
  const accounts = mocks.values.accounts;
  const index = accounts.findIndex(a => a.Name === 'Operations');
  accounts.splice(index, 1);

  const result = await handler({
    configFilePath: 'config.json',
    configRepositoryName: 'PBMMAccel-Repo-Config',
    configCommitId: '',
    organizationAdminRole: '',
    acceleratorPrefix: 'PBMMAccel-',
    parametersTableName: 'PBMMAccel-Parameters',
  });

  // Returns only Accounts that needs to be created
  expect(result.accounts).toHaveLength(1);
});

test('the handler should throw an error when the Accelerator config name does not match the account name', async () => {
  // @ts-ignore
  mocks.values.acceleratorConfig['mandatory-account-configs']['shared-network']['account-name'] = 'modified';

  expect.assertions(1);
  try {
    await handler({
      configFilePath: 'config.json',
      configRepositoryName: 'PBMMAccel-Repo-Config',
      configCommitId: 'fasdjfkhsdf',
      organizationAdminRole: '',
      acceleratorPrefix: 'PBMMAccel-',
      parametersTableName: 'PBMMAccel-Parameters',
    });
  } catch (e) {
    expect(e.message).toMatch('does not match the name in the Accelerator configuration');
  }
});

test('the handler should throw an error when the Accelerator config OU does not match the account OU', async () => {
  // @ts-ignore
  mocks.values.acceleratorConfig['mandatory-account-configs']['shared-network'].ou = 'applications';

  expect.assertions(1);
  try {
    await handler({
      configFilePath: 'config.json',
      configRepositoryName: 'PBMMAccel-Repo-Config',
      configCommitId: 'fasdjfkhsdf',
      organizationAdminRole: '',
      acceleratorPrefix: 'PBMMAccel-',
      parametersTableName: 'PBMMAccel-Parameters',
    });
  } catch (e) {
    expect(e.message).toMatch('is not in OU');
  }
});

/**
 * Method that initialized mocked values with valid defaults.
 */
function reset() {
  mocks.values.organizationalUnits = [
    {
      Id: 'core-ou-id',
      Name: 'core',
    },
    {
      Id: 'applications-ou-id',
      Name: 'applications',
    },
    {
      Id: 'sandbox-ou-id',
      Name: 'Sandbox',
    },
    {
      Id: 'dev-ou-id',
      Name: 'Dev',
    },
    {
      Id: 'central-ou-id',
      Name: 'Central',
    },
    {
      Id: 'test-ou-id',
      Name: 'Test',
    },
    {
      Id: 'prod-ou-id',
      Name: 'Prod',
    },
    {
      Id: 'unclass-ou-id',
      Name: 'UnClass',
    },
  ];

  mocks.values.organizationalUnitAccounts = {
    'core-ou-id': [
      {
        Id: 'primary-account-id',
        Name: 'management',
        Email: 'myemail+pbmmT-management@example.com',
      },
      {
        Id: 'security-account-id',
        Name: 'security',
        Email: 'myemail+pbmmT-sec@example.com',
      },
      {
        Id: 'log-archive-account-id',
        Name: 'log-archive',
        Email: 'myemail+pbmmT-log@example.com',
      },
      {
        Id: 'perimeter-account-id',
        Name: 'Perimeter',
        Email: 'myemail+pbmmT-perimeter@example.com',
      },
      {
        Id: 'shared-network-account-id',
        Name: 'SharedNetwork',
        Email: 'myemail+pbmmT-network@example.com',
      },
      {
        Id: 'operations-account-id',
        Name: 'Operations',
        Email: 'myemail+pbmmT-operations@example.com',
      },
    ],
    'applications-ou-id': [],
    'sandbox-ou-id': [
      {
        Id: 'sandbox-account-id',
        Name: 'TheFunAccount',
        Email: 'myemail+pbmmT-funacct@example.com',
      },
    ],
    'dev-ou-id': [
      {
        Id: 'dev-account-id',
        Name: 'MyDev1',
        Email: 'myemail+pbmmT-dev1@example.com',
      },
    ],
    'central-ou-id': [],
    'test-ou-id': [],
    'prod-ou-id': [],
    'unclass-ou-id': [],
  };

  mocks.values.masterAccount = {
    Name: 'primary',
    Email: 'myemail+pbmmT-management@example.com',
    Id: 'management-account-id',
  };

  mocks.values.accounts = [
    {
      Id: 'primary-account-id',
      Name: 'management',
      Email: 'myemail+pbmmT-management@example.com',
    },
    {
      Id: 'security-account-id',
      Name: 'security',
      Email: 'myemail+pbmmT-sec@example.com',
    },
    {
      Id: 'log-archive-account-id',
      Name: 'log-archive',
      Email: 'myemail+pbmmT-log@example.com',
    },
    {
      Id: 'perimeter-account-id',
      Name: 'Perimeter',
      Email: 'myemail+pbmmT-perimeter@example.com',
    },
    {
      Id: 'shared-network-account-id',
      Name: 'SharedNetwork',
      Email: 'myemail+pbmmT-network@example.com',
    },
    {
      Id: 'operations-account-id',
      Name: 'Operations',
      Email: 'myemail+pbmmT-operations@example.com',
    },
    {
      Id: 'sandbox-account-id',
      Name: 'TheFunAccount',
      Email: 'myemail+pbmmT-funacct@example.com',
    },
    {
      Id: 'dev-account-id',
      Name: 'MyDev1',
      Email: 'myemail+pbmmT-dev1@example.com',
    },
  ];
}
