import * as cdk from '@aws-cdk/core';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { CommonTemplates } from './common/stack';
import { MasterTemplates } from './master/stack';
import { SharedNetwork } from './shared-network/stack';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

const ACCELERATOR_NAME = process.env.ACCELERATOR_NAME!;
const ACCELERATOR_SECRET_ID = process.env.ACCELERATOR_SECRET_ID!;

(async () => {
  const secrets = new SecretsManager();
  const configSecret = await secrets.getSecret(ACCELERATOR_SECRET_ID);
  const config = AcceleratorConfig.fromString(configSecret.SecretString!);

  const mandatoryAccountConfig = config['mandatory-account-configs'];
  const sharedNetworkConfig = mandatoryAccountConfig['shared-network'];

  const app = new cdk.App();

  new CommonTemplates.AssumeRoleStack(app, 'AssumeRole');

  new MasterTemplates.Stack(app, 'Master');

  new SharedNetwork.Stack(app, 'SharedNetwork', {
    stackName: 'PBMMAccel-SharedNetwork',
    accountConfig: sharedNetworkConfig,
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', ACCELERATOR_NAME);
  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
})();
