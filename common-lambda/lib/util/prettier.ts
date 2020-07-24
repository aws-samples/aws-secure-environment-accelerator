import * as prettier from 'prettier';
import { AcceleratorConfig } from '../config';

export function applyPrettier(config: AcceleratorConfig) {
  return prettier.format(JSON.stringify(config, null, 2), {
    parser: 'json',
    tabWidth: 2,
    printWidth: 100,
    singleQuote: true,
    trailingComma: 'all',
    arrowParens: 'avoid',
  });
}
