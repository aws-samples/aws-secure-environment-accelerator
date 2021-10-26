import * as fs from 'fs';
import { AcceleratorConfigType } from '@aws-accelerator/config';
import { en, fr } from '@aws-accelerator/config-i18n';
import { toJsonSchema } from '../src/helpers/json-schema';
import path from 'path';

if (process.argv.length !== 4) {
  throw new Error(`Usage ${process.argv0} <Language> <OUTPUT_FILE>`);
}

const selectedLanguage = process.argv[2];
const outputFile = process.argv[3];

const folder = path.dirname(outputFile);
fs.mkdirSync(folder, { recursive: true });

let schema;
if (selectedLanguage === 'fr') {
  schema = toJsonSchema(AcceleratorConfigType, fr.tr.bind(fr));
} else {
  schema = toJsonSchema(AcceleratorConfigType, en.tr.bind(en));
}
const schemaString = JSON.stringify(schema, null, 2);
fs.writeFileSync(outputFile, schemaString);
