import * as fs from 'fs';
import { compileFromFile } from 'json-schema-to-typescript';
import path from 'path';

if (process.argv.length !== 4) {
  throw new Error(`Usage ${process.argv0} <INPUT_FILE> <OUTPUT_FILE>`);
}

const inputFile = process.argv[2];
const outputFile = process.argv[3];

// Create output folder
const outputFolder = path.dirname(outputFile);
fs.mkdirSync(outputFolder, { recursive: true });

// eslint-disable-next-line @typescript-eslint/no-floating-promises
compileFromFile(`${inputFile}`, {
  bannerComment: '',
}).then(ts => {
  fs.writeFileSync(`${outputFile}`, ts);
});
