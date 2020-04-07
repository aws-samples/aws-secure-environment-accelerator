import * as cdk from '@aws-cdk/core';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { CommonTemplates } from './common/stack';
import { MasterTemplates } from './master/stack';
import { SharedNetwork } from './shared-network/stack';
import { OrganizationalUnit } from './organizational-units/stack';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

const ACCELERATOR_NAME = 'PBMM'; //process.env.ACCELERATOR_NAME!!;
const ACCELERATOR_SECRET_NAME = 'accelerator/config'; //process.env.ACCELERATOR_SECRET_NAME!!;

(async () => {
  const secrets = new SecretsManager();
  const configSecret = await secrets.getSecret(ACCELERATOR_SECRET_NAME);
  const config = AcceleratorConfig.fromString(configSecret.SecretString!!);

  const app = new cdk.App();

  new CommonTemplates.AssumeRoleStack(app, 'AssumeRole');

  new MasterTemplates.Stack(app, 'Master');

  const mandatoryAccountConfig = config['mandatory-account-configs'];

  const sharedNetworkConfig = mandatoryAccountConfig['shared-network'];
  new SharedNetwork.Stack(app, 'SharedNetwork', {
    accountConfig: sharedNetworkConfig,
  });

  const organizationalUnits = config['organizational-units'];
  new OrganizationalUnit.Stack(app, 'OrganizationalUnits', {
    organizationalUnits: organizationalUnits,
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', ACCELERATOR_NAME);
  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
})();
