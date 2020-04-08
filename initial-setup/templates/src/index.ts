import { AcceleratorConfig } from '@aws-pbmm/common-lambda/lib/config';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { App } from './app';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

const ACCELERATOR_NAME = process.env.ACCELERATOR_NAME!;
const CONFIG_SECRET_ID = process.env.CONFIG_SECRET_ID!;
const ACCOUNTS_SECRET_ID = process.env.ACCOUNTS_SECRET_ID!;

async function main() {
  const secrets = new SecretsManager();

  const acceleratorConfigSecret = await secrets.getSecret(CONFIG_SECRET_ID);
  const acceleratorConfig = AcceleratorConfig.fromString(acceleratorConfigSecret.SecretString!);

  const accountsSecret = await secrets.getSecret(ACCOUNTS_SECRET_ID);
  const accounts = JSON.parse(accountsSecret.SecretString!);

  new App({
    acceleratorName: ACCELERATOR_NAME,
    acceleratorConfig,
    accounts,
  });
}

// tslint:disable-next-line: no-floating-promises
main();
