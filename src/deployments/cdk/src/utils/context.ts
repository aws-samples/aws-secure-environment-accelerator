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

export interface Context {
  acceleratorName: string;
  acceleratorPrefix: string;
  acceleratorExecutionRoleName: string;
  defaultRegion: string;
  acceleratorBaseline: 'LANDING_ZONE' | 'ORGANIZATIONS' | 'CONTROL_TOWER' | string;
  acceleratorPipelineRoleName: string;
  configFilePath: string;
  configRepositoryName: string;
  configCommitId: string;
  configBranch: string;
  acceleratorStateMachineName: string;
  configRootFilePath: string;
  installerVersion: string;
  vpcCidrPoolAssignedTable: string;
  subnetCidrPoolAssignedTable: string;
  cidrPoolTable: string;
  centralOperationsAccount?: string;
  masterAccount?: string;
}

export function loadContext(): Context {
  if (process.env.CONFIG_MODE === 'development') {
    const configPath = path.join(__dirname, '..', '..', 'context.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Cannot find local context.json at "${configPath}"`);
    }
    const contents = fs.readFileSync(configPath);
    return JSON.parse(contents.toString());
  }

  return {
    acceleratorName: process.env.ACCELERATOR_NAME!,
    acceleratorPrefix: process.env.ACCELERATOR_PREFIX!,
    acceleratorExecutionRoleName: process.env.ACCELERATOR_EXECUTION_ROLE_NAME!,
    defaultRegion: process.env.AWS_REGION!,
    acceleratorBaseline: process.env.ACCELERATOR_BASELINE!,
    acceleratorPipelineRoleName: process.env.ACCELERATOR_PIPELINE_ROLE_NAME!,
    configBranch: process.env.CONFIG_BRANCH_NAME!,
    configRepositoryName: process.env.CONFIG_REPOSITORY_NAME!,
    configCommitId: process.env.CONFIG_COMMIT_ID!,
    configFilePath: process.env.CONFIG_FILE_PATH!,
    acceleratorStateMachineName: process.env.ACCELERATOR_STATE_MACHINE_NAME!,
    configRootFilePath: process.env.CONFIG_ROOT_FILE_PATH!,
    installerVersion: process.env.INSTALLER_VERSION!,
    vpcCidrPoolAssignedTable: process.env.VPC_CIDR_ASSIGNED_POOL!,
    subnetCidrPoolAssignedTable: process.env.SUBNET_CIDR_ASSIGNED_POOL!,
    cidrPoolTable: process.env.CIDR_POOL!,
  };
}
