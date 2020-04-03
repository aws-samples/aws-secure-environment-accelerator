import * as path from 'path';
import * as cdk from '@aws-cdk/core';
import * as org from 'aws-sdk/clients/organizations';
import { InitialSetup } from '@aws-pbmm/initial-setup-cdk/src';
import { Account } from '@aws-pbmm/common-lambda/lib/aws/accounts';
import { LandingZone } from '@aws-pbmm/common-lambda/lib/landing-zone';
import { AcceleratorNameTagger } from '@aws-pbmm/common-cdk/lib/core/name-tagger';
import { SecretsManager } from '@aws-pbmm/common-lambda/lib/aws/secrets-manager';
import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';

process.on('unhandledRejection', (reason, _) => {
  console.error(reason);
  process.exit(1);
});

/**
 * Find the account with the given name in the accounts array or throw an error if the account does not exist.
 */
function accountByName(accounts: org.Account[], name: string): Account {
  const account = accounts.find((a) => a.Name === name);
  if (account) {
    return {
      id: account.Id!!,
      arn: account.Arn!!,
      name: account.Name!!,
      email: account.Email!!,
    };
  }
  throw new Error(`Cannot find account with name "${name}"`);
}

// tslint:disable:no-floating-promises
(async () => {
  console.log(`Detecting Landing Zone stack...`);

  const landingZone = new LandingZone();
  const landingZoneStack = await landingZone.findLandingZoneStack();
  if (!landingZoneStack) {
    console.error(`Cannot find a Landing Zone stack in your account`);
    process.exit(1);
  }
  console.log(`Detected Landing Zone stack with version "${landingZoneStack.version}"`);

  const organizations = new Organizations();
  const organizationAccounts: org.Account[] = await organizations.listAccounts();

  // Query Secrets Manager to ensure the PBMM Accelerator configuration matches (values of mandatory-ou and expected-ou)
  // ??Query Service catalog ProvisionedProducts (input/output parameters) for all ALZ subaccounts-(One method, is their a better way)?
  // Use the API to query AWS Orgs organization structure and ensure accounts exist in appropriate OU (including nested OU's) and no extra accounts exist in managed ou's.

  // TODO Support nested Organizational Units
  for (const organizationalUnitConfig of landingZoneStack.config.organizational_units) {
    const organizationalUnitConfigName = organizationalUnitConfig.name;
    for (const accountConfig of organizationalUnitConfig.core_accounts) {
      let account: org.Account | undefined;
      if (accountConfig.name === 'primary') {
        account = organizationAccounts.find((a: org.Account) => a.Name === a.Email);
      } else {
        account = organizationAccounts.find((a: org.Account) => a.Name === accountConfig.name);
      }
      if (!account) {
        throw new Error(`Cannot find Landing Zone core account "${accountConfig.name}"`);
      }

      const parents: org.Parent[] = await organizations.listParents(account.Id!!);
      const parent = parents.find((p) => p.Type === 'ORGANIZATIONAL_UNIT');
      if (!parent) {
        throw new Error(`Cannot find organizational unit for account "${account.Name}" with ID "${account.Id}"`);
      }

      // TODO Improve the lookup
      const organizationalUnit = await organizations.getOrganizationalUnit(parent.Id!!);
      if (!organizationalUnit) {
        throw new Error(`Cannot find organizational unit with ID "${parent.Id!!}"`);
      }
      if (organizationalUnit.Name !== organizationalUnitConfigName) {
        throw new Error(`The organizational unit of account "${account.Name}" does not have 
          the name "${organizationalUnitConfigName}" but has the name "${organizationalUnit.Name}"`);
      }
    }
  }

  console.log(`Loading accounts in organization...`);

  // TODO Load these accounts dynamically from the configuration file
  // Load all the relevant accounts in the organization
  const accounts = {
    security: accountByName(organizationAccounts, 'security'),
    logArchive: accountByName(organizationAccounts, 'log-archive'),
    sharedServices: accountByName(organizationAccounts, 'shared-services'),
    sharedNetwork: accountByName(organizationAccounts, 'shared-network'),
    // TODO Load more accounts here
  };
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
