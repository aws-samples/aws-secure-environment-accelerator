import * as cdk from '@aws-cdk/core';
import { pascalCase } from 'pascal-case';
import { MandatoryAccountDeployment } from '../common/mandatory-account-deployment';
import { OrganizationalUnitDeployment } from '../common/organizational-unit-deployment';
import { getAccountId, loadAccounts } from '../utils/accounts';
import { loadAcceleratorConfig } from '../utils/config';
import { loadContext } from '../utils/context';
import { getStackOutput, loadStackOutputs } from '../utils/outputs';
import { OUTPUT_LOG_ARCHIVE_BUCKET_ARN, OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN } from './log-archive';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

async function main() {
  const context = loadContext();
  const acceleratorConfig = await loadAcceleratorConfig();
  const accounts = await loadAccounts();
  const outputs = await loadStackOutputs();

  const logArchiveAccountId = getAccountId(accounts, 'log-archive');
  const logArchiveS3BucketArn = getStackOutput(outputs, 'log-archive', OUTPUT_LOG_ARCHIVE_BUCKET_ARN);
  const logArchiveS3KmsKeyArn = getStackOutput(outputs, 'log-archive', OUTPUT_LOG_ARCHIVE_ENCRYPTION_KEY_ARN);

  const centralLogRetention = acceleratorConfig['global-options']['central-log-retention'];

  const app = new cdk.App();

  // Create all the VPCs for the mandatory accounts
  const mandatoryAccountDeployments: { [accountKey: string]: MandatoryAccountDeployment } = {};
  const mandatoryAccountConfig = acceleratorConfig['mandatory-account-configs'];
  for (const [accountKey, accountConfig] of Object.entries(mandatoryAccountConfig)) {
    const id = pascalCase(accountKey);
    const deployment = new MandatoryAccountDeployment(app, id, {
      context,
      accounts,
      accountKey,
      accountConfig,
      flowLogExpirationInDays: centralLogRetention,
      flowLogBucketReplication: {
        accountId: logArchiveAccountId,
        bucketArn: logArchiveS3BucketArn,
        kmsKeyArn: logArchiveS3KmsKeyArn,
      },
    });
    mandatoryAccountDeployments[accountKey] = deployment;
  }

  // Create all the VPCs for the organizational units
  const organizationalUnits = acceleratorConfig['organizational-units'];
  for (const [ouKey, ouConfig] of Object.entries(organizationalUnits)) {
    const id = pascalCase(ouKey);
    new OrganizationalUnitDeployment(app, id, {
      context,
      accounts,
      ouKey,
      ouConfig,
      mandatoryAccountDeployments,
    });
  }
}

// tslint:disable-next-line: no-floating-promises
main();
