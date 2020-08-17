import * as prettier from 'prettier';
import * as t from 'io-ts';
import { enumType } from '@aws-accelerator/common-types';

export const FORMATS = ['json', 'yaml'] as const;
export const FormatConfigType = enumType<typeof FORMATS[number]>(FORMATS);
export type FormatType = t.TypeOf<typeof FormatConfigType>;

export function pretty(input: string, format: FormatType) {
  return prettier.format(input, {
    parser: format,
    tabWidth: 2,
    printWidth: 120,
    singleQuote: true,
    trailingComma: 'all',
    arrowParens: 'avoid',
  });
}
