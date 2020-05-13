import { backOff } from 'exponential-backoff';

/**
 * Auxiliary function to retry AWS SDK calls when a throttling error occurs.
 */
export function throttlingBackOff<T>(request: () => Promise<T>): Promise<T> {
  return backOff(request, {
    startingDelay: 500,
    retry: e => e.errorType === 'TooManyRequestsException' || e.code === 'Throttling',
  });
}
