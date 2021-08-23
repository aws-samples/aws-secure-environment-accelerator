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
import { createStructuredOutputFinder } from './structured-output';
import { StackOutput } from './stack-output';
import { enums } from '@aws-accelerator/common-types';

export const ResourceType = enums('ResourceType', ['PUBLIC', 'PRIVATE']);
export type ResourceType = t.TypeOf<typeof ResourceType>;

export const StaticResourcesOutput = t.interface(
  {
    id: t.string,
    region: t.string,
    accountKey: t.string,
    suffix: t.number,
    resourceType: t.string,
    resources: t.array(t.string),
  },
  'StaticResourcesOutput',
);

export type StaticResourcesOutput = t.TypeOf<typeof StaticResourcesOutput>;

export const StaticResourcesOutputFinder = createStructuredOutputFinder(StaticResourcesOutput, finder => ({
  tryFindOneByAccountAndRegionAndType: (props: {
    outputs: StackOutput[];
    accountKey?: string;
    region?: string;
    resourceType?: string;
    suffix?: number;
  }) =>
    finder.tryFindOne({
      outputs: props.outputs,
      predicate: output =>
        (props.accountKey === undefined || output.accountKey === props.accountKey) &&
        (props.region === undefined || output.region === props.region) &&
        (props.resourceType === undefined || output.resourceType === props.resourceType) &&
        (props.suffix === undefined || output.suffix === props.suffix),
    }),
}));
