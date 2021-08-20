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
import * as ec2 from '@aws-cdk/aws-ec2';

type Action = (value: cdk.IConstruct) => boolean;

/**
 * Auxiliary interface to allow types as a method parameter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Type<T> = new (...args: any[]) => T;

const ACCEL_P_TAG = 'Accel-P';

function addAccelProtectedTag<T extends cdk.Construct>(
  type: Type<T>,
  acceleratorName: string,
  tagPriority: number = 100,
): Action {
  return (value: cdk.IConstruct) => {
    if (value instanceof type) {
      // Try to add the tags to the value (in case we have an L1 construct like ec2.CfnVPC)
      // Otherwise add it to the value's default child (in case we have an L2 construct like ec2.Vpc)
      if (cdk.TagManager.isTaggable(value)) {
        value.tags.setTag(ACCEL_P_TAG, acceleratorName, tagPriority);
      } else if (cdk.TagManager.isTaggable(value.node.defaultChild)) {
        value.node.defaultChild.tags.setTag(ACCEL_P_TAG, acceleratorName, tagPriority);
      }
      return true;
    }
    return false;
  };
}

export class AcceleratorProtectedTagger implements cdk.IAspect {
  readonly acceleratorName: string;

  // Non-CFN constructs have a tag with higher priority so that the non-CFN construct tag will get priority over the CFN construct tag
  readonly actions: Action[];

  constructor(acceleratorName: string) {
    this.acceleratorName = acceleratorName;
    this.actions = [
      addAccelProtectedTag(ec2.SecurityGroup, this.acceleratorName, 200),
      addAccelProtectedTag(ec2.CfnSecurityGroup, this.acceleratorName, 100),
    ];
  }

  visit(node: cdk.IConstruct): void {
    for (const action of this.actions) {
      if (action(node)) {
        // Break to only apply the first action that matches
        break;
      }
    }
  }
}
