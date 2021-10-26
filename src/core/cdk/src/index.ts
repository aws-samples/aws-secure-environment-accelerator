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

import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import { InitialSetup } from './initial-setup';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

// Make change for test
async function main() {
  const env = process.env;
  const pkg = require('../package.json');

  // Load accelerator parameters
  const app = new cdk.App();

  const acceleratorName = env.ACCELERATOR_NAME || 'ASEA';
  const acceleratorPrefix = env.ACCELERATOR_PREFIX || 'ASEA-';
  const stateMachineName = env.ACCELERATOR_STATE_MACHINE_NAME || `${acceleratorPrefix}MainStateMachine_sm`;
  const stateMachineExecutionRole = env.ACCELERATOR_STATE_MACHINE_ROLE_NAME || `${acceleratorPrefix}PipelineRole`;
  const configRepositoryName = env.CONFIG_REPOSITORY_NAME || `${acceleratorPrefix}Config-Repo`;
  const configBranchName = env.CONFIG_BRANCH_NAME || 'main';
  const configS3Bucket =
    env.CONFIG_S3_BUCKET || `${acceleratorPrefix.toLowerCase()}${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}-config`;
  const codebuildComputeType = env.BUILD_COMPUTE_TYPE || 'BUILD_GENERAL1_LARGE';
  const pageSize = env.DEPLOY_STACK_PAGE_SIZE || '900';
  const enablePrebuiltProject = 'ENABLE_PREBUILT_PROJECT' in env;
  const notificationEmail = env.NOTIFICATION_EMAIL || 'notify@example.com';
  const installerCmk = env.INSTALLER_CMK || `alias/${acceleratorPrefix}Installer-Key`;

  // Make Sure we change version in "package.json" with respect to code releases
  const acceleratorVersion = pkg.version;
  console.log(`Installing Accelerator with version: ${acceleratorVersion}`);

  console.log(`Found accelerator context:`);
  console.log(`  Name: ${acceleratorName}`);
  console.log(`  Prefix: ${acceleratorPrefix}`);

  // Find the root director of the solution
  const solutionRoot = path.join(__dirname, '..', '..', '..', '..');
  // Create the initial setup pipeline stack
  new InitialSetup(app, `${acceleratorPrefix}InitialSetup`, {
    configRepositoryName,
    configBranchName,
    configS3Bucket,
    acceleratorPrefix,
    acceleratorName,
    solutionRoot,
    stateMachineName,
    stateMachineExecutionRole,
    terminationProtection: true,
    enablePrebuiltProject,
    notificationEmail,
    acceleratorVersion,
    installerCmk,
    codebuildComputeType,
    pageSize,
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
