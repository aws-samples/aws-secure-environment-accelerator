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
  const command = args[0];
  if (command === 'snapshot' && args.length < 2 && !['pre', 'post', 'report', 'reset'].includes(args[1])) {
    console.log('Usage: index.ts snapshot pre|post|report|reset');
    return;
  }
  const config = JSON.parse(await readFile(path.join(__dirname, 'input-config', 'input-config.json'), 'utf8'));
  switch (command) {
    case 'resource-mapping':
      await new ResourceMapping(config).process();
      break;
    case 'convert-config':
      await new ConvertAseaConfig(config).process();
      break;
    case 'snapshot':
      const snapshot = new Snapshot(config);
      switch (args[1]) {
        case 'pre':
          await snapshot.pre();
          break;
        case 'post':
          await snapshot.post();
          break;
        case 'report':
          await snapshot.report();
          break;
        case 'reset':
          await snapshot.reset();
          break;
      }
      break;
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
