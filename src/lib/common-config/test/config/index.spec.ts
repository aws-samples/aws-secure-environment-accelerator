import * as fs from 'fs';
import * as path from 'path';
import { AcceleratorConfig } from '../../';

const configFilePath = path.join(__dirname, '..', '..', '..', '..', '..', 'test', 'config.example.json');

test('config.example.json should be parsed correctly', () => {
  // Working directory is `common-lambda` so the config file is one directory up
  const content = fs.readFileSync(configFilePath);
  const result = AcceleratorConfig.fromString(content.toString());

  expect(result).not.toBeNull();
});
