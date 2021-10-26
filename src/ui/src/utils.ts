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
