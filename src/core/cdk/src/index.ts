import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import { InitialSetup } from './initial-setup';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

//Make change for test
async function main() {
  const env = process.env;
  const pkg = require('../package.json');

  // Load accelerator parameters
  const app = new cdk.App();

  const acceleratorName = env.ACCELERATOR_NAME || 'PBMM';
  const acceleratorPrefix = env.ACCELERATOR_PREFIX || 'PBMMAccel-';
  const stateMachineName = env.ACCELERATOR_STATE_MACHINE_NAME || `${acceleratorPrefix}MainStateMachine_sm`;
  const stateMachineExecutionRole = env.ACCELERATOR_STATE_MACHINE_ROLE_NAME || `${acceleratorPrefix}PipelineRole`;

  const configRepositoryName = env.CONFIG_REPOSITORY_NAME || `${acceleratorPrefix}Config-Repo`;
  const configBranchName = env.CONFIG_BRANCH_NAME || 'master';
  const configS3Bucket =
    env.CONFIG_S3_BUCKET || `${acceleratorPrefix.toLowerCase()}${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}-config`;

  const enablePrebuiltProject = 'ENABLE_PREBUILT_PROJECT' in env;
  const notificationEmail = env.NOTIFICATION_EMAIL || 'notify@example.com';

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
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
