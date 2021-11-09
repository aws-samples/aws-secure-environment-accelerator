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
import { JsonOutputValue, JsonOutputProps } from './json-output';

export interface Tag {
  key: string;
  value: string;
}

export interface AddTagsToResource {
  resourceId: string;
  resourceType: 'subnet' | 'security-group' | 'vpc' | 'tgw-attachment';
  targetAccountIds: string[];
  tags: Tag[];
  region: string;
}

export interface AddTagsToResourcesOutputProps extends Omit<JsonOutputProps, 'value' | 'type'> {
  /**
   * List of dependencies that need to be resolved before calling `produceResources`.
   */
  dependencies: cdk.IDependable[];
  /**
   * Function used to produce resources with their tags. You need to define the resources as a function so that the
   * resources can be calculated lazily.
   */
  produceResources: () => AddTagsToResource[];
}

/**
 * Auxiliary construct that emits outputs that can be read by the `add-tags-to-shared-resources` step in the
 * state machine.
 */
export class AddTagsToResourcesOutput extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: AddTagsToResourcesOutputProps) {
    super(scope, id);

    // Use cdk.Lazy here and add dependency on the subnets to make sure the tags are attached to the subnet before
    // rendering the tags
    const output = new JsonOutputValue(this, 'AddTagsToResources', {
      type: 'AddTagsToResources',
      value: props.produceResources,
      description: props.description,
      condition: props.condition,
      exportName: props.exportName,
    });
    for (const dependency of props.dependencies) {
      output.node.addDependency(dependency);
    }
  }
}
