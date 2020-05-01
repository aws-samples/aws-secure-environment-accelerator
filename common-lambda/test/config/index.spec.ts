import * as fs from 'fs';
import { AcceleratorConfig } from '../../lib/config';
import { LandingZoneStack } from '../../lib/landing-zone'

test('config.example.json should be parsed correctly', () => {
  // Working directory is `common-lambda` so the config file is one directory up
  const content = fs.readFileSync('../config.example.json');
  const result = AcceleratorConfig.fromString(content.toString());

  expect(result).not.toBeNull();
});

test('create landing zone config zip', () => {
  LandingZoneStack.createLandingZoneConfig('../reference-artifacts/aws-landing-zone-configuration', 
    '../reference-artifacts/aws-landing-zone-configuration.zip');
});

test('aws-landing-zone-configuration.zip load correctly', () => {
  const content = fs.readFileSync('../reference-artifacts/aws-landing-zone-configuration.zip');
  const result = LandingZoneStack.loadLandingZoneConfig(content);

  expect(result).not.toBeNull();
});
