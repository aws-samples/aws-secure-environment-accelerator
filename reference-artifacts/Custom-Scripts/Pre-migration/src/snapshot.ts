/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { Config } from './config';
import { Reset } from './snapshot/common/dynamodb';
import { getChangedResources } from './snapshot/lib/reporting';
import * as snapshot from './snapshot/snapshotConfiguration';

export class Snapshot {
  private readonly aseaPrefix: string;
  private readonly roleName: string;
  private readonly tableName: string;
  private readonly homeRegion: string;
  private readonly preMigrationSnapshot: boolean;

  constructor(config: Config) {
    this.aseaPrefix = config.aseaPrefix ?? 'ASEA';
    this.roleName = config.assumeRoleName ?? 'OrganizationAccountAccessRole';
    this.tableName = `${this.aseaPrefix}-config-snapshot`;
    this.homeRegion = config.homeRegion ?? 'ca-central-1';
    this.preMigrationSnapshot = false;
  }

  async pre() {
    await snapshot.snapshotConfiguration(this.tableName, this.homeRegion, this.roleName, this.aseaPrefix, true);
  }

  async post() {
    await snapshot.snapshotConfiguration(
      this.tableName,
      this.homeRegion,
      this.roleName,
      this.aseaPrefix,
      this.preMigrationSnapshot,
    );
  }

  async report() {
    await getChangedResources(this.tableName, this.homeRegion);
  }

  async reset() {
    const cleanup = new Reset(this.tableName, this.homeRegion);
    await cleanup.dropTable();
  }
}