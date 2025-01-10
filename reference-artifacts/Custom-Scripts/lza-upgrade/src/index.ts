/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { readFile } from 'fs/promises';
import * as path from 'path';
import { ConvertAseaConfig } from './convert-config';
import { Inventory } from './inventory/inventory';
import { MigrationConfig } from './migration-config';
import { PostMigration } from './post-migration';
import { Preparation } from './preparation';
import { ResourceMapping } from './resource-mapping';
import { Snapshot } from './snapshot';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  validateCommand(args);
  const config = await loadConfig(command);
  config.localOnlyWrites = args.includes('local-update-only');
  config.skipDriftDetection = args.includes('skip-drift-detection');
  config.enableTerminationProtection = args.includes('enable-termination-protection');

  switch (command) {
    case 'migration-config':
      console.log('Creating migration tool configuration file');
      const migrationConfig = new MigrationConfig(config.localOnlyWrites);
      await migrationConfig.configure();
      break;
    case 'inventory':
      const configPath = args[1];
      await new Inventory(configPath).process();
      break;
    case 'resource-mapping':
      await new ResourceMapping(config).process();
      break;
    case 'convert-config':
      await new ConvertAseaConfig(config).process();
      break;
    case 'asea-prep':
      const preparation = new Preparation(config);
      await preparation.prepareAsea();
      break;
    case 'lza-prep':
      const lzaPreparation = new Preparation(config);
      await lzaPreparation.prepareLza();
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
    case 'post-migration':
      await new PostMigration(config, args).process();
      break;
  }
}

function validateCommand(args: string[]) {
  if (args.length === 0) {
    console.log('Usage: index.ts <command>');
    throw new Error('Invalid Command');
  }
  const command = args[0];
  if (command === 'snapshot' && args.length < 2 && !['pre', 'post', 'report', 'reset'].includes(args[1])) {
    console.log('Usage: index.ts snapshot pre|post|report|reset');
    throw new Error('Invalid Command');
  }

  if (command === 'inventory' && args.length < 2) {
    console.log('Usage: index.ts inventory <path-to-asea-config.json>');
    throw new Error('Invalid Command');
  }
}

async function loadConfig(command: string) {
  try {
    return JSON.parse(await readFile(path.join(__dirname, 'input-config', 'input-config.json'), 'utf8'));
  } catch (err) {
    if (command !== 'migration-config' && command !== 'inventory') {
      throw new Error('Could not load configuration. Please run the migration-config command.');
    }
    return {};
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
