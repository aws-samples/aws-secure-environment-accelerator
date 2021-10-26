import * as fs from 'fs';
import * as path from 'path';
import { AcceleratorConfig } from '../../';
import { LandingZoneStack } from '../../../common/src/landing-zone';

const configFilePath = path.join(__dirname, '..', '..', '..', '..', '..', 'test', 'config.ALZ.json');

const landingZoneFilePath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'reference-artifacts',
  'aws-landing-zone-configuration',
);

const landingZoneZipFilePath = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'reference-artifacts',
  'aws-landing-zone-configuration.zip',
);

test('config.example.json should be parsed correctly', () => {
  // Working directory is `common-lambda` so the config file is one directory up
  const content = fs.readFileSync(configFilePath);
  const result = AcceleratorConfig.fromString(content.toString());

  expect(result).not.toBeNull();
});

test('create landing zone config zip', () => {
  LandingZoneStack.createLandingZoneConfig(landingZoneFilePath, landingZoneZipFilePath);
});

test('aws-landing-zone-configuration.zip load correctly', () => {
  const content = fs.readFileSync(landingZoneZipFilePath);
  const result = LandingZoneStack.loadLandingZoneConfig(content);

  expect(result).not.toBeNull();
});
