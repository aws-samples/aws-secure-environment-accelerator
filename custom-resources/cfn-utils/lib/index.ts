import { backOff, IBackOffOptions } from 'exponential-backoff';

// Constants to use accross custom resources
export const CloudWatchRulePrefix = 'CentralLogging';
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
  e.errorType === 'TooManyRequestsException' ||
  e.code === 'Throttling' ||
  e.code === 'ThrottlingException' ||
  e.retryable === true;

export async function delay(ms: number) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
}
