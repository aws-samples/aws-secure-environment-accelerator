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

import * as t from 'io-ts';
import * as cdk from '@aws-cdk/core';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { StructuredValue, findValuesFromOutputs } from '@aws-accelerator/common-outputs/src/structured-output';

export interface StructuredOutputProps<T> {
  type: t.Type<T>;
  value: T;
}

export interface StructuredOutputFilter<T> {
  type: t.Type<T>;
  accountKey?: string;
}

export type CfnStructuredOutputClass<T> = new (scope: cdk.Construct, id: string, value: T) => cdk.Construct;

export function createCfnStructuredOutput<T>(type: t.Type<T>): CfnStructuredOutputClass<T> {
  class Impl extends cdk.Construct {
    constructor(scope: cdk.Construct, id: string, value: T) {
      super(scope, id);

      new StructuredOutput(this, 'Output', {
        type,
        value,
      });
    }
  }
  return Impl;
}

/**
 * Wrapper around JsonOutputValue that uses io-ts to encode and decode data in the JSON output value.
 */
export class StructuredOutput<T> extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: StructuredOutputProps<T>) {
    super(scope, id);

    const value: StructuredValue<T> = {
      type: props.type.name,
      value: props.value,
    };
    new cdk.CfnOutput(this, 'Output', {
      value: JSON.stringify(value),
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  static fromOutputs<T>(outputs: StackOutput[], filter: StructuredOutputFilter<T>): T[] {
    return findValuesFromOutputs({
      outputs,
      type: filter.type,
      accountKey: filter.accountKey,
    });
  }
}
