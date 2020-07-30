import * as yaml from 'js-yaml';

export function getFormatedObject(input: string, format: 'json' | 'yaml') {
  if (!input || input === '') {
    return null;
  }
  if (format === 'json') {
    return JSON.parse(input);
  } else {
    return yaml.load(input);
  }
}

// tslint:disable-next-line:no-any
export function getStringFromObject(input: any, format: 'json' | 'yaml') {
  if (format === 'json') {
    return JSON.stringify(input);
  } else {
    return yaml.dump(input);
  }
}
