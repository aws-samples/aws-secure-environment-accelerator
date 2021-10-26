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

import { LandingZoneAccountType, BaseLineType } from '@aws-accelerator/common-config/src';

export interface LoadConfigurationInput {
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  organizationAdminRole: string;
  acceleratorPrefix: string;
  parametersTableName: string;
  baseline?: BaseLineType;
  acceleratorVersion?: string;
  configRootFilePath?: string;
  storeAllOutputs?: boolean;
  phases?: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smInput?: any;
}

export interface LoadConfigurationOutput {
  organizationalUnits: ConfigurationOrganizationalUnit[];
  accounts: ConfigurationAccount[];
  regions: string[];
  warnings: string[];
  configCommitId: string;
  acceleratorVersion?: string;
}

export interface ConfigurationAccount {
  accountId?: string;
  accountKey: string;
  accountName: string;
  emailAddress: string;
  organizationalUnit: string;
  isMandatoryAccount: boolean;
  landingZoneAccountType?: LandingZoneAccountType;
  ouPath?: string;
}

export interface ConfigurationOrganizationalUnit {
  ouId: string;
  ouKey: string;
  ouName: string;
  ouPath: string;
}
