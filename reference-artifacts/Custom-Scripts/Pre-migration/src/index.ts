import { readFile } from 'fs/promises';
import * as path from 'path';
import { ConvertAseaConfig } from './convert-config';
import { ResourceMapping } from './resource-mapping';
import { Snapshot } from './snapshot';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: index.ts <command>');
    return;
  }
  const command = process.argv.slice(2)[0];
  const config = JSON.parse(await readFile(path.join(__dirname, 'input-config', 'input-config.json'), 'utf8'));
  if (command === 'resource-mapping') {
    await new ResourceMapping(config).process();
  }
  if (command === 'convert-config') {
    await new ConvertAseaConfig(config).process();
  }
  if (command === 'snapshot-pre') {
    await new Snapshot(config).pre();
  }
  if (command === 'snapshot-post') {
    await new Snapshot(config).post();
  }
  if (command === 'snapshot-report') {
    await new Snapshot(config).report();
  }
  if (command === 'snapshot-reset') {
    await new Snapshot(config).reset();
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
