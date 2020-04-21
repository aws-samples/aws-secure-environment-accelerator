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
  const acceleratorName = process.env.ACCELERATOR_NAME;
  const acceleratorPrefix = process.env.ACCELERATOR_PREFIX;
  const configSecretName = process.env.ACCELERATOR_CONFIG_SECRET_ID;
  const executionRoleName = process.env.ACCELERATOR_EXECUTION_ROLE_NAME || 'AcceleratorPipelineRole';

  if (!acceleratorName) {
    throw new Error(`Please set environment variable "ACCELERATOR_NAME"`);
  } else if (!acceleratorPrefix) {
    throw new Error(`Please set environment variable "ACCELERATOR_PREFIX"`);
  } else if (!configSecretName) {
    throw new Error(`Please set environment variable "ACCELERATOR_CONFIG_SECRET_ID"`);
  }

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
    executionRoleName,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
