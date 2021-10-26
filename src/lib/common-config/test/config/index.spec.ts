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

import * as fs from 'fs';
import * as path from 'path';
import { AcceleratorConfig, ReplacementsConfig } from '../../';
import { additionalReplacements, replaceDefaults } from '../../../common/src/util/common';

const baseDir = path.join(__dirname, '..', '..', '..', '..', '..');

test.each([
  'reference-artifacts/SAMPLE_CONFIGS/config.example.json',
  'reference-artifacts/SAMPLE_CONFIGS/config.lite-VPN-example.json',
  'reference-artifacts/SAMPLE_CONFIGS/config.multi-region-example.json',
  'reference-artifacts/SAMPLE_CONFIGS/config.ultralite-example.json',
  'reference-artifacts/SAMPLE_CONFIGS/config.test-example.json',
  'test/config.example.json',
])('%s should be parsed correctly', file => {
  const content = fs.readFileSync(path.join(baseDir, file));
  const replacements: ReplacementsConfig = JSON.parse(content.toString()).replacements ?? {};

  // Replace variables in the JSON file
  const replaced = replaceDefaults({
    config: content.toString(),
    acceleratorName: 'PBMM',
    acceleratorPrefix: 'PBMM-Accel',
    additionalReplacements: additionalReplacements(replacements),
    region: 'us-east-1',
  });

  // Parse the configuration file
  const result = AcceleratorConfig.fromString(replaced);

  expect(result).not.toBeNull();
});
