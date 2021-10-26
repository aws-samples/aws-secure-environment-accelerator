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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Producer = () => any;

export interface JsonOutputProps extends Omit<cdk.CfnOutputProps, 'value'> {
  readonly type: string;
  /**
   * Function used to produce a value or the value itself.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly value: any | Producer;
}

/**
 * Auxiliary construct that emits outputs that can be read by the `add-tags-to-shared-resources` step in the
 * state machine.
 */
export class JsonOutputValue extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: JsonOutputProps) {
    super(scope, id);

    let value;
    if (typeof props.value === 'function') {
      value = cdk.Lazy.string({
        produce: () =>
          JSON.stringify({
            type: props.type,
            value: props.value(),
          }),
      });
    } else {
      value = JSON.stringify({
        type: props.type,
        value: props.value,
      });
    }

    new cdk.CfnOutput(this, 'Output', {
      value,
      description: props.description,
      condition: props.condition,
      exportName: props.exportName,
    });
  }
}
