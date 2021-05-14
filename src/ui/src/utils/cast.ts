/* eslint-disable @typescript-eslint/no-explicit-any */

export function toArray(value: any): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

export function toObject(value: any): any {
  if (typeof value === 'object') {
    return value;
  }
  return {};
}
