import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import { InitialSetup } from '@aws-pbmm/initial-setup-cdk/src';
import { getOrganizationAccounts } from '@aws-pbmm/common-lambda/lib/aws/accounts';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

(async () => {
  console.log(`Loading accounts in organization...`);

  // Load all the relevant accounts in the organization
  const accounts = await getOrganizationAccounts();
  console.log(`Found accounts in organization:`);
  console.log(accounts);

  // Find the ARN of the config secret
  const secrets = new SecretsManager();
  const configSecretName = 'accelerator/config'; // TODO Should we get this name from a variable?
  let configSecretArn;
  try {
    const configSecret = await secrets.getSecret(configSecretName);
    configSecretArn = configSecret.ARN!!;
  } catch (e) {
    console.error(`Please store the configuration file in the secrets manager with name "${configSecretName}"`);
    process.exit(1);
  }

  console.log(`Found accelerator config:`);
  console.log(`  Secret: ${configSecretArn}`);

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
    configSecretArn,
    acceleratorPrefix,
    acceleratorName,
    solutionRoot,
    executionRoleName,
    accounts,
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', acceleratorName);
  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
})();
