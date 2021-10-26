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

import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { StackOutput } from '@aws-accelerator/common-outputs/src/stack-output';
import { Account } from '../utils/accounts';
import { Limiter } from '../utils/limits';
import { Context } from '../utils/context';
import { AccountStacks } from '../common/account-stacks';
import { OrganizationalUnit } from '@aws-accelerator/common-outputs/src/organizations';

export type PhaseDeploy = (input: PhaseInput) => Promise<void>;

export interface PhaseInput {
  acceleratorConfig: AcceleratorConfig;
  accountStacks: AccountStacks;
  accounts: Account[];
  context: Context;
  outputs: StackOutput[];
  limiter: Limiter;
  organizations: OrganizationalUnit[];
}
