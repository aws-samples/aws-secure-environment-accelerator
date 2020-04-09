import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import { InitialSetup } from '@aws-pbmm/initial-setup-cdk/src';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

(async () => {
  const configSecretName = 'accelerator/config'; // TODO Should we get this name from a variable?

  // Load accelerator name from context
  const app = new cdk.App();
  const acceleratorPrefix = app.node.tryGetContext('prefix');
  const acceleratorName = app.node.tryGetContext('accelerator');

  console.log(`Found accelerator context:`);
  console.log(`  Prefix: ${acceleratorPrefix}`);
  console.log(`  Name: ${acceleratorName}`);

  // Find the root director of the solution
  const solutionRoot = path.join(__dirname, '..', '..', '..');

  // This role will be installed in subaccounts and assumed by the pipeline
  const executionRoleName = 'AcceleratorPipelineRole';

  // Create the initial setup pipeline stack
  await InitialSetup.create(app, `${acceleratorPrefix}InitialSetup`, {
    configSecretName,
    acceleratorPrefix,
    acceleratorName,
    solutionRoot,
    executionRoleName,
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', acceleratorName);
  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
})();
