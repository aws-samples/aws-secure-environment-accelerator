/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as fs from 'fs';
import { toJsonSchema } from '@aws-accelerator/io-ts-json-schema-gen';
import { AcceleratorConfigType } from '../src';

if (process.argv.length !== 3) {
  throw new Error(`Usage ${process.argv0} <OUTPUT_FILE>`);
}

const outputFile = process.argv[2];

const schema = toJsonSchema(AcceleratorConfigType);
const schemaString = JSON.stringify(schema, null, 2);
fs.writeFileSync(outputFile, schemaString);
