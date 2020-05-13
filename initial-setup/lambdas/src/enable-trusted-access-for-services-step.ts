import { Organizations } from '@aws-pbmm/common-lambda/lib/aws/organizations';
import { FMS } from '@aws-pbmm/common-lambda/lib/aws/fms';
import { Account } from './load-accounts-step';

interface EnableTrustedAccessForServicesInput {
  accounts: Account[];
}

export const handler = async (input: EnableTrustedAccessForServicesInput) => {
  console.log(`Enable Trusted Access for AWS services within the organization ...`);
  console.log(JSON.stringify(input, null, 2));

  const { accounts } = input;

  const securityAccount = accounts.find(a => a.type === 'security');
  if (!securityAccount) {
    throw new Error(`Cannot find account with type security`);
  }
  const securityAccountId: string = securityAccount.id;

  const org = new Organizations();
  await org.enableAWSServiceAccess('ram.amazonaws.com');
  console.log('Enabled Resource Access Manager service access within the Organization.');

  await org.enableAWSServiceAccess('fms.amazonaws.com');
  console.log('Enabled Firewall Manager service access within the Organization.');

  const fms = new FMS();
  await fms.associateAdminAccount(securityAccountId);
  console.log('Security account registered as admin account for Firewall Manager in the organization.');

  await org.enableAWSServiceAccess('access-analyzer.amazonaws.com');
  console.log('Enabled Access Analyzer service access within the Organization.');

  await org.enableAWSServiceAccess('config-multiaccountsetup.amazonaws.com');
  console.log('Enabled Config service access within the Organization.');

  await org.registerDelegatedAdministrator(securityAccountId, 'access-analyzer.amazonaws.com');
  console.log('Security account registered as delegated administrator for Access Analyzer in the organization.');

  return {
    status: 'SUCCESS',
    statusReason: `Successfully enabled trusted access for AWS services within the organization.`,
  };
};
