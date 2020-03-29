import * as cdk from '@aws-cdk/core';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { CommonTemplates } from './common/stack';
import { MasterTemplates } from './master/stack';
import { SharedNetwork } from './shared-network/stack';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

const ACCELERATOR_NAME = process.env.ACCELERATOR_NAME!!;
const ACCELERATOR_PREFIX = process.env.ACCELERATOR_PREFIX!!;
const ACCELERATOR_SECRET_NAME = process.env.ACCELERATOR_SECRET_NAME!!;

(async () => {
  const secrets = new SecretsManager();
  const configSecret = await secrets.getSecret(ACCELERATOR_SECRET_NAME);
  const config = JSON.parse(configSecret.SecretString!!) as AcceleratorConfig; // TODO Use a library like io-ts to parse the configuration file

  const app = new cdk.App();

  new CommonTemplates.AssumeRoleStack(app, 'AssumeRole');

  new MasterTemplates.Stack(app, 'Master');

  new SharedNetwork.Stack(app, 'SharedNetwork', {
    // TODO Load this from config
    region: 'ca-central',
    cidr: '100.96.250.0/23',
    subnets: [{
      name: 'PublicSharedAz1',
      availabilityZone: '1a',
      cidr: '100.96.251.64/26',
    }, {
      name: 'PublicSharedAz2',
      availabilityZone: '1b',
      cidr: '100.96.251.128/26',
    }],
  });

  // Add accelerator tag to all resources
  cdk.Tag.add(app, 'Accelerator', ACCELERATOR_NAME);
  // Add name tag to all resources
  app.node.applyAspect(new AcceleratorNameTagger());
})();
