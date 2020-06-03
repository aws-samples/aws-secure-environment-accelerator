import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import { InitialSetup } from '@aws-pbmm/initial-setup-cdk/src';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const env = process.env;

  // Load accelerator parameters
  const app = new cdk.App();

  const acceleratorName = env.ACCELERATOR_NAME || 'PBMM';
  const acceleratorPrefix = env.ACCELERATOR_PREFIX || 'PBMMAccel-';
  const stateMachineName = env.ACCELERATOR_STATE_MACHINE_NAME || `${acceleratorPrefix}MainStateMachine_sm`;
  const stateMachineExecutionRole = env.ACCELERATOR_STATE_MACHINE_ROLE_NAME || `${acceleratorPrefix}PipelineRole`;

  const configRepositoryName = env.CONFIG_REPOSITORY_NAME || `${acceleratorPrefix}Config-Repo`;
  const configBranchName = env.CONFIG_BRANCH_NAME || 'master';
  const configFilePath = env.CONFIG_FILE_PATH || 'config.json';
  const configS3FileName = env.CONFIG_S3_KEY || `config.json`;
  const configS3Bucket =
    env.CONFIG_S3_BUCKET || `${acceleratorPrefix.toLowerCase()}${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}-config`;

  const enablePrebuiltProject = 'ENABLE_PREBUILT_PROJECT' in env;

  console.log(`Found accelerator context:`);
  console.log(`  Name: ${acceleratorName}`);
  console.log(`  Prefix: ${acceleratorPrefix}`);
  console.log(`  Code Commit Configuration: ${configFilePath} from ${configRepositoryName}`);
  console.log(`  Existing S3 Configuration: ${configS3FileName} from ${configS3Bucket}`);

  // Find the root director of the solution
  const solutionRoot = path.join(__dirname, '..', '..', '..');

  // Create the initial setup pipeline stack
  await InitialSetup.create(app, `${acceleratorPrefix}InitialSetup`, {
    configFilePath,
    configRepositoryName,
    configBranchName,
    configS3Bucket,
    configS3FileName,
    acceleratorPrefix,
    acceleratorName,
    solutionRoot,
    stateMachineName,
    stateMachineExecutionRole,
    terminationProtection: true,
    enablePrebuiltProject,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
