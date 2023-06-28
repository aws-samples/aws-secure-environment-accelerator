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

export interface SnapshotData {
  jsonData: string;
  hash: string;
}

export interface DbWrite {
  accountId: string;
  region: string;
  resourceName: string;
  preMigration: boolean;
  data: SnapshotData;
}

export interface TableKey {
  hashKey: string;
  sortKey: string;
}
export type TableKeys = TableKey[];

export interface ResourceData {
  accountRegion: string;
  resourceName: string;
  preMigrationConfig: string;
  postMigrationConfig: string;
}

export type ChangedResources = ResourceData[];

export const regions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ap-south-1',
  'ap-northeast-3',
  'ap-northeast-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ca-central-1',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'sa-east-1',
];
