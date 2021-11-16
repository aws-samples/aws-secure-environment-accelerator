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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as fs from 'fs';
import * as path from 'path';
import * as validate from '../../../src/compare/validate';
import { compareConfiguration, getAccountNames } from '../../../src/compare/config-diff';
import { AcceleratorConfig } from '../../..';

// Working directory is `common-lambda` so the config file is one directory up
const configFilePath = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'test', 'config.example.json');
const content = fs.readFileSync(configFilePath);

// Keep context for all the tests
let config1: AcceleratorConfig;
let config2: AcceleratorConfig;

beforeEach(() => {
  config1 = JSON.parse(content.toString());
  config2 = JSON.parse(content.toString());
});

test('should return the correct account names', () => {
  const accounts = getAccountNames(config1);
  expect(accounts).toEqual([
    'SharedNetwork',
    'Operations',
    'Perimeter',
    'management',
    'log-archive',
    'security',
    'TheFunAccount',
    'MyDev1',
  ]);
});

test('no differences should be reported when the configuration file did not change', () => {
  const differences = compareConfiguration(config1, config2);
  expect(differences).toBeUndefined();
});

test('validate account email should work', async () => {
  config2['mandatory-account-configs'].master.email = 'random@amazon.com';

  const differences = compareConfiguration(config1, config2);
  expect(differences).toBeDefined();

  const errors: string[] = [];
  await validate.validateAccountEmail(differences!, errors);

  expect(errors).toHaveLength(1);
});

test('validate MAD dir-id should work', async () => {
  config2['mandatory-account-configs'].operations.deployments!.mad!['dir-id'] = 666;

  const differences = compareConfiguration(config1, config2);
  expect(differences).toBeDefined();

  const errors: string[] = [];
  await validate.validateMad(differences!, errors);

  expect(errors).toHaveLength(1);
});
