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

export const FirewallConfigReplacementsOutput = t.interface(
  {
    name: t.string,
    instanceId: t.string,
    instanceName: t.string,
    replacements: t.record(t.string, t.string),
  },
  'FirewallConfigReplacementsOutput',
);
export type FirewallConfigReplacementsOutput = t.TypeOf<typeof FirewallConfigReplacementsOutput>;
export const FirewallConfigReplacementsOutputFinder = createStructuredOutputFinder(
  FirewallConfigReplacementsOutput,
  () => ({}),
);
