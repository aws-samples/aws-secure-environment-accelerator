import * as prettier from 'prettier';

export function pretty(input: string, format: 'json' | 'yaml' = 'json') {
  return prettier.format(input, {
    parser: format,
    tabWidth: 2,
    printWidth: 120,
    singleQuote: true,
    trailingComma: 'all',
    arrowParens: 'avoid',
  });
}
