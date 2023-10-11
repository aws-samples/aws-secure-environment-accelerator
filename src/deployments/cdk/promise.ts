export type PromiseResult<T> = PromiseFulfilledResult<T> | PromiseRejectedResult;

export async function fulfillAll<T>(promises: Promise<T>[]): Promise<T[]> {
  const promiseResults = await Promise.allSettled(promises);
  const rejectedResults = promiseResults.filter(promiseIsRejected);
  if (rejectedResults.length > 0) {
    const reasons = rejectedResults.map(r => `${r.reason}\n${r.reason.stack}`);
    throw new Error(reasons.join('\n'));
  }
  const fulfilledResults = promiseResults.filter(promiseIsFulfilled);
  return fulfilledResults.map(p => p.value);
}

export function promiseIsFulfilled<T>(promise: PromiseResult<T>): promise is PromiseFulfilledResult<T> {
  return promise.status === 'fulfilled';
}

export function promiseIsRejected<T>(promise: PromiseResult<T>): promise is PromiseRejectedResult {
  return promise.status === 'rejected';
}
