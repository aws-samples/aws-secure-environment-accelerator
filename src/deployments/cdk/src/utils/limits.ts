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

import * as fs from 'fs';
import * as path from 'path';
import { Limit, LimitOutput } from '@aws-accelerator/common-outputs/src/limits';
import { DynamoDB } from '@aws-accelerator/common/src/aws/dynamodb';

export { Limit, LimitOutput } from '@aws-accelerator/common-outputs/src/limits';

export type LimitOutputs = LimitOutput[];

export async function loadLimits(): Promise<LimitOutputs> {
  if (process.env.CONFIG_MODE === 'development') {
    const limitsPath = path.join(__dirname, '..', '..', 'limits.json');
    if (!fs.existsSync(limitsPath)) {
      throw new Error(`Cannot find local limits.json at "${limitsPath}"`);
    }
    const contents = fs.readFileSync(limitsPath);
    return JSON.parse(contents.toString());
  }

  const tableName = process.env.DYNAMODB_PARAMETERS_TABLE_NAME;
  if (!tableName) {
    throw new Error(`The environment variable "DYNAMODB_PARAMETERS_TABLE_NAME" needs to be set`);
  }

  const limitsItemId = process.env.LIMITS_ITEM_ID;
  if (!limitsItemId) {
    throw new Error(`The environment variable "LIMITS_ITEM_ID" needs to be set`);
  }

  const itemsInput = {
    TableName: tableName,
    Key: { id: { S: limitsItemId } },
  };

  const limits = await new DynamoDB().getItem(itemsInput);
  if (!limits.Item) {
    throw new Error(`Cannot find value with Item ID "${limitsItemId}"`);
  }
  return JSON.parse(limits.Item.value.S!);
}

export function tryGetQuotaByAccountAndLimit(
  limits: LimitOutputs,
  accountKey: string,
  limit: Limit,
): number | undefined {
  const limitOutput = limits.find(a => a.accountKey === accountKey && a.limitKey === limit);
  return limitOutput?.value;
}

export function tryGetQuotaByAccountRegionAndLimit(
  limits: LimitOutputs,
  accountKey: string,
  limit: Limit,
  region: string,
): number | undefined {
  const limitOutput = limits.find(a => a.accountKey === accountKey && a.limitKey === limit && a.region === region);
  return limitOutput?.value;
}

export class Limiter {
  readonly limits: LimitOutputs;
  readonly counts: { [index: string]: number } = {};

  constructor(limits: LimitOutputs) {
    this.limits = limits;
  }

  create(accountKey: string, limit: Limit, region: string, suffix?: string): boolean {
    const quota = tryGetQuotaByAccountRegionAndLimit(this.limits, accountKey, limit, region);
    if (!quota) {
      return true;
    }
    const index = `${accountKey}/${region}/${limit}/${suffix}`;
    const count = this.counts[index] ?? 0;
    if (count < quota) {
      this.counts[index] = count + 1;
      return true;
    }
    return false;
  }
}
