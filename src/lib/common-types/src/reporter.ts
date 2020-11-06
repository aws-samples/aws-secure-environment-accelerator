import { Context, getFunctionName, ValidationError } from 'io-ts';
import { Reporter } from 'io-ts/lib/Reporter';
import { fold } from 'fp-ts/lib/Either';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stringify(v: any): string {
  if (typeof v === 'function') {
    return getFunctionName(v);
  }
  if (typeof v === 'number' && !isFinite(v)) {
    if (isNaN(v)) {
      return 'NaN';
    }
    return v > 0 ? 'Infinity' : '-Infinity';
  }
  return JSON.stringify(v);
}

function getContextPath(context: Context): string {
  return context.map(({ key, type }) => key).join('/');
}

function getMessage(e: ValidationError): string {
  return e.message !== undefined
    ? e.message
    : `Invalid value ${stringify(e.value)} supplied to ${getContextPath(e.context)}`;
}

/**
 * @since 1.0.0
 */
export function failure(es: ValidationError[]): string[] {
  return es.map(getMessage);
}

/**
 * @since 1.0.0
 */
export function success(): string[] {
  return ['No errors!'];
}

/**
 * @since 1.0.0
 */
export const PathReporter: Reporter<string[]> = {
  report: fold(failure, success),
};
