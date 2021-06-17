/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Returns the given value if the value is a string and if it is not empty. Return undefined otherwise.
 */
export function emptyStringAsUndefined(value: any): string | undefined {
  if (typeof value === 'string' && /\S/.test(value)) {
    return value;
  }
  return undefined;
}

/**
 * Returns the given value if the value is an array. Return a new empty array otherwise.
 */
export function valueAsArray<T = any>(value: any): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}
