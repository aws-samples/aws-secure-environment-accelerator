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
