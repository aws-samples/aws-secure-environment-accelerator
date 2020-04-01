import * as fs from 'fs';
import { AcceleratorConfig } from '../../lib/config';

test('config.example.json should be parsed correctly', () => {
  // Working directory is `common-lambda` so the config file is one directory up
  const content = fs.readFileSync('../config.example.json');
  const result = AcceleratorConfig.fromString(content.toString());

  expect(result).not.toBeNull();
});
