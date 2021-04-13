import * as prettier from 'prettier';

export type FormatType = 'json' | 'yaml';

export function pretty(input: string, format: FormatType) {
  console.log(`Applying Prettier for format "${format}"`);
  return prettier.format(input, {
    parser: format,
    tabWidth: 2,
    printWidth: 120,
    singleQuote: true,
    trailingComma: 'all',
    arrowParens: 'avoid',
  });
}
