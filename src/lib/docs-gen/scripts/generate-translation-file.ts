import * as fs from 'fs';
import path from 'path';
import { TranslationExtractHelper } from '../src/helpers/translation-extract-helper';

if (process.argv.length !== 5) {
  throw new Error(`Usage ${process.argv0} <LANGUAGE_CODE> <INPUT_FILE> <OUTPUT_FILE>`);
}

const languageCode = process.argv[2];
const inputFile = process.argv[3];
const outputFile = process.argv[4];

// Create output folder
const outputFolder = path.dirname(outputFile);
fs.mkdirSync(outputFolder, { recursive: true });

// Get input json schema file
let raw = fs.readFileSync(`${inputFile}`, 'utf8');
let schemaParsed = JSON.parse(raw);

// Get base translation
let baseTranslationRaw = fs.readFileSync(`./src/i18n/base-${languageCode}.json`, 'utf8');
let baseTranslationParsed = JSON.parse(baseTranslationRaw);

// Extract translations
const translationHelper = new TranslationExtractHelper(languageCode);
translationHelper.iterate(schemaParsed);

// Merge base and extracted translations
for(const prop in baseTranslationParsed[languageCode]){
  translationHelper.typeDocTranslation[languageCode][prop] = baseTranslationParsed[languageCode][prop];
}

const schemaString = JSON.stringify(translationHelper.typeDocTranslation, null, 2);
fs.writeFileSync(outputFile, schemaString);

