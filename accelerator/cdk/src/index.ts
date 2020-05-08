import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import { InitialSetup } from '@aws-pbmm/initial-setup-cdk/src';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  // Load accelerator parameters
  const app = new cdk.App();
  const acceleratorName = process.env.ACCELERATOR_NAME || 'PBMM';
  const acceleratorPrefix = process.env.ACCELERATOR_PREFIX || 'PBMMAccel-';
  const configSecretName = process.env.ACCELERATOR_CONFIG_SECRET_ID || 'accelerator/config';
  const stateMachineName = process.env.ACCELERATOR_STATE_MACHINE_NAME || `${acceleratorPrefix}MainStateMachine`;
  const stateMachineExecutionRole = process.env.ACCELERATOR_STATE_MACHINE_ROLE_NAME || `${acceleratorPrefix}PipelineRole`;

  console.log(`Found accelerator context:`);
  console.log(`  Name: ${acceleratorName}`);
  console.log(`  Prefix: ${acceleratorPrefix}`);
  console.log(`  Configuration: ${configSecretName}`);

  // Find the root director of the solution
  const solutionRoot = path.join(__dirname, '..', '..', '..');

  // Create the initial setup pipeline stack
  await InitialSetup.create(app, `${acceleratorPrefix}InitialSetup`, {
    configSecretName,
    acceleratorPrefix,
    acceleratorName,
    solutionRoot,
    stateMachineName,
    stateMachineExecutionRole,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
