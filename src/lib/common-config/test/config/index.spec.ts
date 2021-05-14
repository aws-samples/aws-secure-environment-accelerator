import * as fs from 'fs';
import * as path from 'path';
import { AcceleratorConfig, ReplacementsConfig } from '../../';
import { additionalReplacements, replaceDefaults } from '../../../common/src/util/common';

const baseDir = path.join(__dirname, '..', '..', '..', '..', '..');

test.each([
  'reference-artifacts/SAMPLE_CONFIGS/config.example.json',
  'reference-artifacts/SAMPLE_CONFIGS/config.lite-example.json',
  'reference-artifacts/SAMPLE_CONFIGS/config.multi-region-example.json',
  'reference-artifacts/SAMPLE_CONFIGS/config.ultralite-example.json',
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
