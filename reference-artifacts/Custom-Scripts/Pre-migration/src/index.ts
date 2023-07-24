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
import { ResourceMapping } from './resource-mapping';
import { Snapshot } from './snapshot';
import { Preparation } from './preparation';

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
    case 'asea-prep':
      const preparation = new Preparation(config);
      await preparation.prepareAsea();
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
