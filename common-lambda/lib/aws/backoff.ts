import { backOff } from 'exponential-backoff';

export function throttlingBackOff<T>(request: () => Promise<T>): Promise<T> {
  return backOff(request, {
    retry: e => e.errorType === 'TooManyRequestsException' || e.code === 'Throttling',
  });
}
