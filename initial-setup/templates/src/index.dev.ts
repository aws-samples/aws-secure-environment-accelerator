import * as fs from 'fs';
import * as path from 'path';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { App } from './app';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const acceleratorConfigPath = path.join(__dirname, '..', 'config.json');
  if (!fs.existsSync(acceleratorConfigPath)) {
    throw new Error(`Cannot find local config.json at "${acceleratorConfigPath}"`);
  }
  const accountsConfigPath = path.join(__dirname, '..', 'accounts.json');
  if (!fs.existsSync(accountsConfigPath)) {
    throw new Error(`Cannot find local accounts.json at "${accountsConfigPath}"`);
  }

  // Get the accelerator config from config.json
  const acceleratorConfigStr = fs.readFileSync(acceleratorConfigPath);
  const acceleratorConfig = AcceleratorConfig.fromBuffer(acceleratorConfigStr);

  // Get the accounts config from accounts.json
  const accountsConfigStr = fs.readFileSync(accountsConfigPath);
  const accounts = JSON.parse(accountsConfigStr.toString());

  new App({
    acceleratorName: 'PBMM',
    acceleratorConfig,
    accounts,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
