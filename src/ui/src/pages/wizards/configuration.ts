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

import * as c from '@aws-accelerator/config';
import * as t from '@aws-accelerator/common-types';
import { getTypeTree } from '@/types';
import { useObservable } from '@/components/accelerator-config-context';

export const Configuration = t.interface({
  region: t.optional(t.region),
  authenticated: t.optional(t.boolean),
  controlTowerDetected: t.optional(t.boolean),
});
export type Configuration = t.TypeOf<typeof Configuration>;

export const AcceleratorConfigurationNode = getTypeTree(c.AcceleratorConfigType);
export const ConfigurationNode = getTypeTree(Configuration);

export const WIZARD_STATE_NAME = 'wizard' as const;
export const useWizardObservable = () => useObservable(WIZARD_STATE_NAME);
