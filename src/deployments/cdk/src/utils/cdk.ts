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

import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';

export function overrideLogicalId(construct: cdk.Construct, logicalId: string) {
  const bucket = findChildOfType(s3.CfnBucket, construct);
  const sanitized = logicalId.replace(/[^a-zA-Z0-9+]+/gi, '');
  bucket.overrideLogicalId(sanitized);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Type<T> = new (...args: any[]) => T;

export function findChildOfType<T>(type: Type<T>, construct: cdk.Construct): T {
  if (construct instanceof type) {
    return construct;
  }
  for (const child of construct.node.children) {
    if (child instanceof type) {
      return child;
    }
  }
  throw new Error(`Cannot find child of type ${type} in construct ${construct.toString()}`);
}
