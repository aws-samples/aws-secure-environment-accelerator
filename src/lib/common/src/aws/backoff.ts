import { backOff, IBackOffOptions } from 'exponential-backoff';

/**
 * Auxiliary function to retry AWS SDK calls when a throttling error occurs.
 */
export function throttlingBackOff<T>(
  request: () => Promise<T>,
  options?: Partial<Omit<IBackOffOptions, 'retry'>>,
): Promise<T> {
  return backOff(request, {
    startingDelay: 500,
    jitter: 'full',
    retry: isThrottlingError,
    ...options,
  });
}

// tslint:disable-next-line: no-any
export const isThrottlingError = (e: any) =>
  e.code === 'TooManyRequestsException' ||
  e.code === 'Throttling' ||
  e.code === 'ThrottlingException' ||
  e.retryable === true ||
  e.code === 'InternalException';
