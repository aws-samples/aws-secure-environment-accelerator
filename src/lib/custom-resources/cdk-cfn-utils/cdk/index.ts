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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isThrottlingError = (e: any) =>
  e.retryable === true ||
  e.code === 'ConcurrentModificationException' || // Retry for AWS Organizations
  e.code === 'InsufficientDeliveryPolicyException' || // Retry for ConfigService
  e.code === 'NoAvailableDeliveryChannelException' || // Retry for ConfigService
  e.code === 'ConcurrentModifications' || // Retry for AssociateHostedZone
  e.code === 'TooManyRequestsException' ||
  e.code === 'Throttling' ||
  e.code === 'ThrottlingException' ||
  e.code === 'InternalErrorException' ||
  e.code === 'InternalException';

export async function delay(ms: number) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
}

export function paginate<T>(input: T[], pageNumber: number, pageSize: number): T[] {
  return input.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
}
