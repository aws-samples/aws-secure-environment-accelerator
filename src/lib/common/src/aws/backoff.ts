/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { backOff, IBackOffOptions } from 'exponential-backoff';

/**
 * Auxiliary function to retry AWS SDK calls when a throttling error occurs.
 */
export function throttlingBackOff<T>(
  request: () => Promise<T>,
  options?: Partial<Omit<IBackOffOptions, 'retry'>>,
): Promise<T> {
  const defaultDelay = 500;
  let maxDelayValue = 2000;

  if (process.env.BACKOFF_START_DELAY) {
    const backoffStartDelay = parseInt(process.env.BACKOFF_START_DELAY, 10);
    if (Number.isInteger(backoffStartDelay)) {
      maxDelayValue = backoffStartDelay;
    }
  }

  // Add jitter to the starting delay
  const startingDelay = Math.random() * (maxDelayValue - defaultDelay + 1) + defaultDelay;

  console.log(`throttlingBackOff delay set to ${startingDelay}`);

  return backOff(request, {
    startingDelay,
    delayFirstAttempt: false,
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
  e.code === 'InternalException' ||
  e.code === 'RateExceeded'; // CodeCommit
