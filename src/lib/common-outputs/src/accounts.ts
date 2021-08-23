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

export type LandingZoneAccountType = 'primary' | 'security' | 'log-archive' | 'shared-services';

export interface Account {
  key: string;
  id: string;
  arn: string;
  name: string;
  ou: string;
  email: string;
  type?: LandingZoneAccountType;
  ouPath?: string;
  isMandatory?: boolean;
  isNew?: boolean;
  inScope?: boolean;
  isDeployed?: boolean;
}

export function getAccountId(accounts: Account[], accountKey: string): string | undefined {
  const account = accounts.find(a => a.key === accountKey);
  if (!account) {
    console.warn(`Cannot find account with key "${accountKey}"`);
    return;
  }
  return account.id;
}

export function getAccountArn(accounts: Account[], accountKey: string): string | undefined {
  const account = accounts.find(a => a.arn === accountKey);
  if (!account) {
    console.warn(`Cannot find account with key "${accountKey}"`);
    return;
  }
  return account.id;
}
